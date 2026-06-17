import { ethers } from "ethers";

// ─── ENS Sepolia Contract Addresses (ENSv2 Alpha - June 2026) ──────────────
// IMPORTANT: The old controllers (0xfb3c, 0xFED6) have been REVOKED from BaseRegistrar.
// The only active controllers are the new ENSv2 TestnetV1PremigrationRegistrar contracts.
const ENS_CONTROLLER = "0xdf60C561Ca35AD3C89D24BbA854654b1c3477078"; // TestnetV1PremigrationRegistrar (active controller on BaseRegistrar)
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"; // Same on all networks
const ENS_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"; // PublicResolver Sepolia

const REGISTRATION_DURATION = 365 * 24 * 60 * 60; // 1 year

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const BASE_REGISTRAR_ABI = [
    "function available(uint256 id) view returns (bool)",
    "function nameExpires(uint256 id) view returns (uint256)",
];

// ENSv2 Alpha TestnetV1PremigrationRegistrar ABI
// Key difference from old controller:
//   - NO commit/reveal scheme (no makeCommitment, no commit, no commitments)
//   - NO rentPrice (registration is FREE on testnet, ETH is refunded)
//   - Single-step register() call
const CONTROLLER_ABI = [
    "function register(tuple(string label, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, uint8 reverseRecord, bytes32 referrer) registration) external payable",

    // --- CUSTOM ERRORS ---
    "error NameNotAvailable(string name)",
    "error DurationTooShort(uint256 duration)",
    "error ResolverRequiredWhenDataSupplied()",
    "error ResolverRequiredForReverseRecord()",
    "error ExpiryTooLarge(uint256 expiry)",
    "error RefundFailed(address recipient, uint256 amount)",
];
const iface = new ethers.Interface(CONTROLLER_ABI);

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
 * ENSv2 Alpha on Sepolia is FREE — returns 0.
 * @returns {bigint} total price in wei (always 0 on testnet)
 */
export async function getRentPrice(name, signer) {
    // ENSv2 Alpha TestnetV1PremigrationRegistrar is FREE
    // The contract refunds all ETH sent to it
    return 0n;
}

/**
 * Create registration payload.
 * ENSv2 Alpha does NOT use commit/reveal, so this just builds the struct.
 */
export async function createCommitment(name, ownerAddress) {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const registration = {
        label: name,
        owner: ownerAddress,
        duration: REGISTRATION_DURATION,
        secret,
        resolver: ENS_RESOLVER,
        data: [],
        reverseRecord: 0,
        referrer: ethers.ZeroHash,
    };
    return { registration, secret };
}

/**
 * Submit commitment — ENSv2 Alpha skips commit/reveal entirely.
 * This function is kept for backward compatibility with the UI flow,
 * but it does NOT send any transaction. It returns immediately.
 */
export async function submitCommitment(registration, signer) {
    console.log("[ENS Debug] ENSv2 Alpha: No commit/reveal needed. Skipping commit step.");
    // Return a fake commitment hash and current timestamp
    // The UI will use these to determine when to allow Step 2
    const commitmentHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "address", "uint256", "bytes32"],
        [registration.label, registration.owner, registration.duration, registration.secret]
    ));
    return { commitmentHash, timestamp: Math.floor(Date.now() / 1000) - 120 };
}

/**
 * Check commitment status — always returns "ready" for ENSv2 Alpha.
 */
export async function checkCommitmentStatus(commitmentHash) {
    // ENSv2 Alpha: no commit/reveal, always ready
    return Math.floor(Date.now() / 1000) - 120; // Pretend it was committed 2 minutes ago
}

/**
 * Register the name directly — single-step on ENSv2 Alpha.
 * The TestnetV1PremigrationRegistrar is FREE and refunds all ETH.
 */
export async function registerName(registration, signer) {
    console.log("[ENS Debug] registerName called with ENSv2 Alpha controller:", ENS_CONTROLLER);
    console.log("[ENS Debug] Registration payload:", registration);

    const controller = new ethers.Contract(
        ENS_CONTROLLER,
        CONTROLLER_ABI,
        signer
    );

    const ownerAddress = await signer.getAddress();

    // ----------------------------------------------------
    // 1. Availability Check
    // ----------------------------------------------------
    const { available } = await checkAvailability(registration.label, signer);
    if (!available) {
        throw new Error(`${registration.label}.eth is no longer available.`);
    }
    console.log("[ENS Debug] Name is available ✓");

    // ----------------------------------------------------
    // 2. Static Call Simulation
    // ----------------------------------------------------
    try {
        console.log("[ENS Debug] Running staticCall simulation...");
        const rpcProvider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
        const rpcController = new ethers.Contract(ENS_CONTROLLER, CONTROLLER_ABI, rpcProvider);

        await rpcController.register.staticCall(registration, {
            value: 0n, // FREE on testnet
            from: ownerAddress,
        });
        console.log("✅ [ENS Debug] staticCall succeeded!");
    } catch (err) {
        console.error("🚨 [ENS Debug] staticCall failed:", err);

        let revertHex = err.data || err.error?.data || err.info?.error?.data;
        if (typeof revertHex === 'string' && revertHex.includes("0x")) {
            revertHex = "0x" + revertHex.split("0x")[1];
        }

        if (revertHex && typeof revertHex === 'string' && revertHex.length > 2) {
            console.log("[ENS Debug] Revert data:", revertHex);
            try {
                const decoded = iface.parseError(revertHex);
                if (decoded) {
                    throw new Error(`ENS Contract rejected: ${decoded.name}(${decoded.args.join(", ")})`);
                }
            } catch (decodeErr) {
                if (decodeErr.message.startsWith("ENS Contract rejected")) throw decodeErr;
                throw new Error(`ENS Contract rejected (Hex): ${revertHex}`);
            }
        } else {
            console.warn("[ENS Debug] No revert data, proceeding to real transaction...");
        }
    }

    // ----------------------------------------------------
    // 3. Gas Estimation
    // ----------------------------------------------------
    let safeGasLimit;
    try {
        const estimatedGas = await controller.register.estimateGas(registration, { value: 0n });
        safeGasLimit = (estimatedGas * 150n) / 100n; // 50% buffer for safety
        console.log("[ENS Debug] Estimated gas:", estimatedGas.toString(), "-> safe:", safeGasLimit.toString());
    } catch (err) {
        console.warn("[ENS Debug] estimateGas failed, using default gas limit.", err.message?.slice(0, 100));
        safeGasLimit = 500000n;
    }

    // ----------------------------------------------------
    // 4. Send Transaction (FREE — no ETH needed)
    // ----------------------------------------------------
    console.log("[ENS Debug] Sending register transaction with gasLimit:", safeGasLimit.toString());
    let receipt;
    try {
        const tx = await controller.register(registration, {
            value: 0n, // FREE on ENSv2 Alpha testnet
            gasLimit: safeGasLimit,
        });

        console.log("[ENS Debug] Tx sent, waiting for confirmation... Hash:", tx.hash);
        receipt = await tx.wait();
    } catch (error) {
        console.error("[ENS Debug] Transaction failed:", error.message);
        throw new Error(`Registration transaction failed: ${error.message}`);
    }

    if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction reverted on-chain.");
    }

    console.log("✅ [ENS Debug] Registration successful! Block:", receipt.blockNumber);
    return receipt;
}

export async function setStealthRecords(name, stealthMeta, signer) {
    const ownerAddress = await signer.getAddress();
    const nameHash = ethers.namehash(`${name}.eth`);
    const resolver = new ethers.Contract(ENS_RESOLVER, RESOLVER_ABI, signer);
    const resolverIface = new ethers.Interface(RESOLVER_ABI);

    const multicallData = [
        resolverIface.encodeFunctionData("setAddr", [nameHash, ownerAddress]),
        resolverIface.encodeFunctionData("setText", [nameHash, "stealth.scanPub", stealthMeta.scanPub]),
        resolverIface.encodeFunctionData("setText", [nameHash, "stealth.spendPub", stealthMeta.spendPub]),
        resolverIface.encodeFunctionData("setText", [nameHash, "stealth.indexHash", stealthMeta.indexHash]),
    ];

    const tx = await resolver.multicall(multicallData);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
        throw new Error("Set records transaction failed.");
    }
    return receipt;
}