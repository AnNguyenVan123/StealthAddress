import { ethers } from "ethers";

// ─── ENS Sepolia Contract Addresses (verified) ────────────────────────────────
const ENS_CONTROLLER = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968"; // ETHRegistrarController
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"; // Same on all networks
const ENS_RESOLVER   = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD"; // PublicResolver Sepolia

const REGISTRATION_DURATION = 365 * 24 * 60 * 60; // 1 year
const MIN_COMMITMENT_AGE    = 65;                   // seconds (60 + 5s buffer)

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const BASE_REGISTRAR_ABI = [
    "function available(uint256 id) view returns (bool)",
    "function nameExpires(uint256 id) view returns (uint256)",
];

// ENS v2 uses a single Registration struct
const CONTROLLER_ABI = [
    "function available(string label) view returns (bool)",
    "function rentPrice(string label, uint256 duration) view returns (tuple(uint256 base, uint256 premium) price)",
    "function makeCommitment(tuple(string label, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, uint8 reverseRecord, bytes32 referrer) registration) pure returns (bytes32)",
    "function commit(bytes32 commitment) external",
    "function register(tuple(string label, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, uint8 reverseRecord, bytes32 referrer) registration) external payable",
];

// Used to set text records AFTER registration
const RESOLVER_ABI = [
    "function setText(bytes32 node, string key, string value) external",
    "function setAddr(bytes32 node, address addr) external",
    "function multicall(bytes[] calldata data) external returns (bytes[] memory results)",
];

/**
 * Check tên có sẵn không bằng BaseRegistrar (địa chỉ ổn định trên mọi network).
 * @param {string} name - e.g. "alice" (không có .eth)
 * @param {ethers.Signer} signer
 * @returns {{ available: boolean, expires?: Date }}
 */
export async function checkAvailability(name, signer) {
    if (!name || name.length < 3) throw new Error("Name must be at least 3 characters.");
    const labelHash = BigInt(ethers.keccak256(ethers.toUtf8Bytes(name)));
    const base = new ethers.Contract(BASE_REGISTRAR, BASE_REGISTRAR_ABI, signer);
    const isAvailable = await base.available(labelHash);
    if (!isAvailable) {
        try {
            const expires = await base.nameExpires(labelHash);
            return { available: false, expires: new Date(Number(expires) * 1000) };
        } catch { return { available: false }; }
    }
    return { available: true };
}

/**
 * Lấy giá đăng ký từ ETHRegistrarController.
 * @returns {bigint} total price (including 15% buffer) in wei
 */
export async function getRentPrice(name, signer) {
    try {
        const c = new ethers.Contract(ENS_CONTROLLER, CONTROLLER_ABI, signer);
        const price = await c.rentPrice(name, REGISTRATION_DURATION);
        return price.base + price.premium;
    } catch {
        return 0n;
    }
}

/**
 * Đăng ký ENS tự động và set stealth keys qua 3 bước:
 *   Tx 1: commit
 *   Wait 65s
 *   Tx 2: register (không kèm data để tránh multicallWithNodeCheck)
 *   Tx 3: set text records bằng resolver.multicall()
 *
 * @param {string} name - nhãn ngắn (vd: "alice")
 * @param {{ scanPub, spendPub, indexHash }} stealthMeta
 * @param {ethers.Signer} signer
 * @param {function} onProgress - (message, phase) => void
 * @returns {string} "name.eth"
 */
export async function registerEnsWithStealthKeys(name, stealthMeta, signer, onProgress = () => {}) {
    const ownerAddress = await signer.getAddress();
    const controller   = new ethers.Contract(ENS_CONTROLLER, CONTROLLER_ABI, signer);
    const nameHash     = ethers.namehash(`${name}.eth`);

    // ── Bước 1: Verify lần cuối ────────────────────────────────────────────
    onProgress("Verifying availability...", "check");
    const { available } = await checkAvailability(name, signer);
    if (!available) throw new Error(`"${name}.eth" is already taken. Please choose another name.`);

    // ── Bước 2: Xây dựng Registration struct (KHÔNG có data để tránh multicall issue) ──
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const registration = {
        label:         name,
        owner:         ownerAddress,
        duration:      REGISTRATION_DURATION,
        secret,
        resolver:      ENS_RESOLVER,   // Set resolver nhưng không set records trong tx này
        data:          [],              // Empty → bỏ qua multicallWithNodeCheck
        reverseRecord: 0,
        referrer:      ethers.ZeroHash,
    };

    // ── Bước 3: Commit ─────────────────────────────────────────────────────
    onProgress("Creating commitment...", "commit");
    const commitment = await controller.makeCommitment(registration);

    onProgress("Submitting commitment (Tx 1/3)...", "commit-tx");
    const commitTx = await controller.commit(commitment);
    await commitTx.wait();

    // ── Bước 4: Đợi minCommitmentAge ──────────────────────────────────────
    onProgress(`Commitment confirmed! Waiting ${MIN_COMMITMENT_AGE}s...`, "wait");
    await new Promise((resolve) => {
        let remaining = MIN_COMMITMENT_AGE;
        const id = setInterval(() => {
            remaining--;
            onProgress(`Waiting ${remaining}s before registration...`, "wait");
            if (remaining <= 0) { clearInterval(id); resolve(); }
        }, 1000);
    });

    // ── Bước 5: Register ──────────────────────────────────────────────────
    onProgress("Registering name (Tx 2/3)...", "register");
    let priceWithBuffer = 0n;
    try {
        const price = await controller.rentPrice(name, REGISTRATION_DURATION);
        priceWithBuffer = (price.base + price.premium) * 115n / 100n;
    } catch { /* Sepolia may be free */ }

    const registerTx = await controller.register(registration, { value: priceWithBuffer });
    await registerTx.wait();
    onProgress(`"${name}.eth" registered! Setting stealth records (Tx 3/3)...`, "records");

    // ── Bước 6: Set stealth text records via resolver.multicall() ──────────
    const resolver     = new ethers.Contract(ENS_RESOLVER, RESOLVER_ABI, signer);
    const resolverIface = new ethers.Interface(RESOLVER_ABI);

    const multicallData = [
        resolverIface.encodeFunctionData("setAddr",  [nameHash, ownerAddress]),
        resolverIface.encodeFunctionData("setText",  [nameHash, "stealth.scanPub",   stealthMeta.scanPub]),
        resolverIface.encodeFunctionData("setText",  [nameHash, "stealth.spendPub",  stealthMeta.spendPub]),
        resolverIface.encodeFunctionData("setText",  [nameHash, "stealth.indexHash", stealthMeta.indexHash]),
    ];

    const setRecordsTx = await resolver.multicall(multicallData);
    await setRecordsTx.wait();

    onProgress(`"${name}.eth" fully configured with stealth keys! 🎉`, "done");
    return `${name}.eth`;
}
