import { ethers } from "ethers";
import { generateStealthAddress } from "../stealth/stealthAddress.js";
import { getLeafProof, computeIndexCommitment } from "../stealth/zkIntegration";
import { stealthAccountFactoryAbi } from "../abi/stealthAccountFactoryAbi";
import { announcerAbi } from "../abi/announcerAbi";

const RPC_URL = import.meta.env.VITE_RPC_URL;
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS;
const ANNOUNCER_ADDRESS = import.meta.env.VITE_ANNOUNCER_ADDRESS;

/**
 * Resolve recipient's abstract account address from their already-published
 * indexCommitment (no leaf publication — the leaf was published at account creation).
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
 * Builds announcer metadata
 */
export function buildAnnouncerMetadata(viewTag) {
    const descBytes = ethers.toUtf8Bytes("ETH payment");
    const metaBytes = new Uint8Array(2 + descBytes.length);
    metaBytes[0] = 0x01;
    metaBytes[1] = viewTag;
    metaBytes.set(descBytes, 2);
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
    senderStealthEOA,   // sender's ephemeral stealth EOA → circuit private input stealthEOA
    ephemeralPub,
    metadata,
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
            valueString: ethers.parseEther(amountEther).toString(),
            senderIndexCommitment,
            spendPriv,
            senderStealthEOA,
            factoryAddress,
            announcerAddress,
            schemeId: 1,
            ephemeralPub,
            metadata,
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
 * @param {object} sender    - { address, stealthEOA, indexCommitment }
 * @param {object} recipient - { scanPub, spendPub, indexHash } ← indexHash is part of the recipient's meta-address
 * @param {string} amountEther
 * @param {function} onProgress
 */
export async function executeStealthTransfer(sender, recipient, amountEther, onProgress = () => { }) {
    onProgress("Generating recipient stealth address...");
    const stealth = generateStealthAddress({
        scanPub: recipient.scanPub,
        spendPub: recipient.spendPub,
    });

    onProgress("Computing dynamic index commitment for this payment...");
    const indexCommitment = await computeIndexCommitment(recipient.indexHash, stealth.address);

    onProgress("Resolving recipient abstract account...");
    const { abstractAccount: recipientAbstractAccount } = await getRecipientAbstractAccount(
        indexCommitment
    );

    const metadata = buildAnnouncerMetadata(stealth.viewTag);

    onProgress("Submitting to relayer to generate ZK Proof and execute transfer...");
    const txHash = await callSpendZkProofApi({
        senderStealthAddress: sender.address,
        recipientIndexCommitment: indexCommitment,
        recipientAbstractAccount,
        amountEther,
        senderIndexCommitment: sender.indexCommitment,
        spendPriv: sender.spendPriv,           // private ZK circuit input
        senderStealthEOA: sender.stealthEOA,   // private ZK circuit input
        ephemeralPub: stealth.ephemeralPub,
        metadata,
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
export async function sendStealthPayment(recipient, amountEther, onProgress = () => { }) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Step 1: Generate ephemeral stealth address (ECDH — for the announcement)
    onProgress("Generating stealth address...");
    const stealth = generateStealthAddress({ scanPub: recipient.scanPub, spendPub: recipient.spendPub });
    const stealthEOA = stealth.address;

    // Step 2: Resolve recipient's AA from dynamic indexCommitment
    onProgress("Resolving recipient abstract account...");
    const indexCommitment = await computeIndexCommitment(recipient.indexHash, stealthEOA);
    const factory = new ethers.Contract(FACTORY_ADDRESS, stealthAccountFactoryAbi, signer);
    const abstractAccountAddress = await factory.getFunction("getAddress")(indexCommitment);

    // Step 3: Send ETH to the recipient's Abstract Account
    onProgress("Sending ETH...");
    const sendTx = await signer.sendTransaction({
        to: abstractAccountAddress,
        value: ethers.parseEther(amountEther),
    });
    await sendTx.wait();

    // Step 4: Announce on-chain (ERC-5564)
    // Announced address is the ECDH-derived stealthEOA so the recipient's scanner can detect it.
    onProgress("Announcing on-chain...");
    const announcer = new ethers.Contract(ANNOUNCER_ADDRESS, announcerAbi, signer);
    const metadata = buildAnnouncerMetadata(stealth.viewTag);
    const announceTx = await announcer.announce(1, stealthEOA, stealth.ephemeralPub, metadata);
    await announceTx.wait();

    return announceTx.hash;
}
