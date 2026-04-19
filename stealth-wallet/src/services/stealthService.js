import { ethers } from "ethers";
import { generateStealthAddress } from "../stealth/stealthAddress.js";
import { getLeafProof, computeIndexCommitment } from "../stealth/zkIntegration";
import { stealthAccountFactoryAbi } from "../abi/stealthAccountFactoryAbi";
import { announcerAbi } from "../abi/announcerAbi";

const RPC_URL = import.meta.env.VITE_RPC_URL;
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS;
const ANNOUNCER_ADDRESS = import.meta.env.VITE_ANNOUNCER_ADDRESS;
const SERVER_URL = import.meta.env.VITE_SERVER_URL;
/**
 * Resolve recipient's abstract account from indexCommitment.
 *
 * @param {string} recipientIndexCommitment  - 0x-prefixed hex, shared as part of the recipient's meta-address
 * @returns {{ abstractAccount: string }}
 */
export async function getRecipientAbstractAccount(recipientIndexCommitment) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const factory = new ethers.Contract(FACTORY_ADDRESS, stealthAccountFactoryAbi, provider);
    const abstractAccount = await factory.getFunction("getAddress")(recipientIndexCommitment);
    return { abstractAccount };
}

/**
 * Builds announcer metadata.
 * Format:
 * [1-byte version][1-byte viewTag][32-byte sharedSecretHash][utf8 note...]
 */
export function buildAnnouncerMetadata(viewTag, sharedSecretHash) {
    if (!sharedSecretHash) {
        throw new Error("Missing sharedSecretHash for metadata");
    }
    const hashBytes = ethers.getBytes(sharedSecretHash);
    if (hashBytes.length !== 32) {
        throw new Error("sharedSecretHash must be 32 bytes");
    }
    const descBytes = ethers.toUtf8Bytes("ETH payment");
    const metaBytes = new Uint8Array(34 + descBytes.length);
    metaBytes[0] = 0x01;
    metaBytes[1] = viewTag;
    metaBytes.set(hashBytes, 2);
    metaBytes.set(descBytes, 34);
    return ethers.hexlify(metaBytes);
}

/**
 * Fetch Merkle proof
 */
export async function fetchMerkleProof(stealthEOA) {
    const leafHex = ethers.zeroPadValue(stealthEOA, 32);
    return await getLeafProof(leafHex);
}


/**
 * Call relayer API to generate ZK proof and execute stealth transfer.
 */
export async function callSpendZkProofApi({
    senderStealthAddress,
    recipientIndexCommitment,
    recipientAbstractAccount,
    amountEther,
    senderIndexCommitment,
    spendPriv,          // sender's spending private key → circuit private input x
    senderSharedSecretHash, // circuit private input #2
    ephemeralPub,
    metadata,
    tokenType,
    tokenAddress,
    tokenId,
    factoryAddress,
    announcerAddress,
}) {
    const response = await fetch(`${SERVER_URL}/api/spend-zk-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            senderStealthAddress,
            recipientIndexCommitment,
            recipientAbstractAccount,
            valueString: amountEther, // Passed directly, pre-parsed
            senderIndexCommitment,
            spendPriv,
            senderSharedSecretHash,
            factoryAddress,
            announcerAddress,
            schemeId: 1,
            ephemeralPub,
            metadata,
            tokenType,
            tokenAddress,
            tokenId
        }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || response.statusText);
    }

    const result = await response.json();
    return result.txHash;
}

/**
 * Full stealth transfer pipeline (sender spends from their stealth AA → recipient's AA).
 *
 * Leaf publication no longer happens here. Both the sender's and recipient's leaves
 * were already published at account creation time.
 *
 * @param {object} sender    - { address, sharedSecretHash, indexCommitment }
 * @param {object} recipient - { scanPub, spendPub, indexHash } ← indexHash is part of the recipient's meta-address
 * @param {string} amountEther
 * @param {function} onProgress
 */
export async function executeStealthTransfer(sender, recipient, amountEther, params = {}, onProgress = () => { }) {
    if (
        !sender?.address ||
        !sender?.indexCommitment ||
        !sender?.spendPriv ||
        !sender?.sharedSecretHash
    ) {
        throw new Error(
            "Missing sender fields for spend proof (address/indexCommitment/spendPriv/proofInput). Please re-scan wallets and try again."
        );
    }

    onProgress("Generating recipient stealth address...");
    const stealth = generateStealthAddress({
        scanPub: recipient.scanPub,
        spendPub: recipient.spendPub,
    });

    onProgress("Computing dynamic index commitment for this payment...");
    const indexCommitment = await computeIndexCommitment(recipient.indexHash, stealth.sharedSecretHash);

    onProgress("Resolving recipient abstract account...");
    const { abstractAccount: recipientAbstractAccount } = await getRecipientAbstractAccount(
        indexCommitment
    );

    const metadata = buildAnnouncerMetadata(stealth.viewTag, stealth.sharedSecretHash);

    let parsedValue = ethers.parseEther(amountEther || "0").toString();
    if (params.tokenType === "ERC20") {
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const token = new ethers.Contract(params.tokenAddress, ["function decimals() view returns (uint8)"], provider);
            const decimals = await token.decimals();
            parsedValue = ethers.parseUnits(amountEther || "0", Number(decimals)).toString();
        } catch (e) {
            console.warn("Failed to fetch decimals, assuming 18");
        }
    }

    onProgress("Submitting to relayer to generate ZK Proof and execute transfer...");
    const txHash = await callSpendZkProofApi({
        senderStealthAddress: sender.address,
        recipientIndexCommitment: indexCommitment,
        recipientAbstractAccount,
        amountEther: parsedValue,
        senderIndexCommitment: sender.indexCommitment,
        spendPriv: sender.spendPriv,           // private ZK circuit input
        senderSharedSecretHash: sender.sharedSecretHash, // private ZK circuit input #2
        ephemeralPub: stealth.ephemeralPub,
        metadata,
        tokenType: params.tokenType,
        tokenAddress: params.tokenAddress,
        tokenId: params.tokenId,
        factoryAddress: FACTORY_ADDRESS,
        announcerAddress: ANNOUNCER_ADDRESS,
    });
    return txHash;
}
/**
 * Sends a stealth payment using the connected MetaMask wallet (for the Send.jsx flow).
 * This is the SENDER path: MetaMask funds the transaction directly.
 *
 * Steps:
 *   1. Generate stealth address from recipient meta-address
 *   2. Deploy recipient Abstract Account via factory (MetaMask pays gas)
 *   3. Send ETH from MetaMask → Abstract Account
 *   4. Broadcast ERC-5564 Announcement on-chain
 *   5. Publish recipient leaf to Merkle tree server
 *
 * @param {object} recipient - { scanPub, spendPub }
 * @param {string} amountEther - ETH string e.g. "0.01"
 * @param {function} onProgress - callback(message: string)
 * @returns {string} announceTxHash
 */


/**
 * Sends a stealth payment using MetaMask (direct ETH send path, no ZK).
 *
 * Leaf publication is NOT done here. The recipient's leaf was already published
 * at their account creation. We compute their indexCommitment dynamically for this payment.
 *
 * @param {object} recipient  - { scanPub, spendPub, indexHash }
 * @param {string} amountEther
 * @param {function} onProgress
 * @returns {string} announceTxHash
 */
export async function sendStealthPayment(recipient, amountEther, params = {}, onProgress = () => { }) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Step 1: Generate ephemeral stealth address (ECDH — for the announcement)
    onProgress("Generating stealth address...");
    const stealth = generateStealthAddress({ scanPub: recipient.scanPub, spendPub: recipient.spendPub });
    const stealthEOA = stealth.address;

    // Step 2: Resolve recipient's AA from dynamic indexCommitment
    onProgress("Resolving recipient abstract account...");
    const indexCommitment = await computeIndexCommitment(recipient.indexHash, stealth.sharedSecretHash);
    const factory = new ethers.Contract(FACTORY_ADDRESS, stealthAccountFactoryAbi, signer);
    const abstractAccountAddress = await factory.getFunction("getAddress")(indexCommitment);

    // Step 3: Send Asset to the recipient's Abstract Account
    if (params.tokenType === "ERC20") {
        onProgress("Sending ERC-20...");
        const erc20Abi = ["function decimals() view returns (uint8)", "function transfer(address to, uint256 amount) returns (bool)"];
        const tokenContract = new ethers.Contract(params.tokenAddress, erc20Abi, signer);
        let decimals = 18;
        try {
            decimals = await tokenContract.decimals();
        } catch (e) {
            console.warn("Failed to fetch decimals, assuming 18");
        }
        const parsedAmount = ethers.parseUnits(amountEther || "0", Number(decimals));
        const sendTx = await tokenContract.transfer(abstractAccountAddress, parsedAmount);
        await sendTx.wait();
    } else if (params.tokenType === "ERC721") {
        onProgress("Sending ERC-721...");
        const erc721Abi = ["function transferFrom(address from, address to, uint256 tokenId)"];
        const tokenContract = new ethers.Contract(params.tokenAddress, erc721Abi, signer);
        const sendTx = await tokenContract.transferFrom(await signer.getAddress(), abstractAccountAddress, params.tokenId);
        await sendTx.wait();
    } else {
        onProgress("Sending ETH...");
        const sendTx = await signer.sendTransaction({
            to: abstractAccountAddress,
            value: ethers.parseEther(amountEther || "0"),
        });
        await sendTx.wait();
    }

    // Step 4: Announce on-chain (ERC-5564)
    // Announced address is the ECDH-derived stealthEOA so the recipient's scanner can detect it.
    onProgress("Announcing on-chain...");
    const announcer = new ethers.Contract(ANNOUNCER_ADDRESS, announcerAbi, signer);
    const metadata = buildAnnouncerMetadata(stealth.viewTag, stealth.sharedSecretHash);
    const announceTx = await announcer.announce(1, stealthEOA, stealth.ephemeralPub, metadata);
    await announceTx.wait();

    return announceTx.hash;
}
