import { contract } from '../config/index.js';
import { generateUpdateProof } from './zkService.js';

/**
 * Push a new Merkle root on-chain after a leaf insertion.
 * Generates a ZK proof of the SMT update.
 */
export async function updateRootOnChain(
    oldRootHex,
    newRootHex,
    newLeafHex,
    leafIndex,
    oldLeafHex,
    proofRes
) {
    if (!contract) {
        console.log(`[Simulation] Would update root on-chain: ${newRootHex}`);
        return null;
    }

    try {
        console.log(`[⛓️] Updating root on-chain: ${newRootHex} (leaf: ${newLeafHex} at index ${leafIndex})`);

        // ── Guard: verify the on-chain root matches what we expect ──────────
        // The SMT verifier uses `uint256(root)` (current on-chain root) as
        // publicSignals[0]. If our local oldRoot diverges, the proof will always
        // fail — abort early with a clear message rather than wasting the prover.
        const actualOnChainRoot = `0x${BigInt(await contract.root()).toString(16).padStart(64, '0')}`;
        const normalizedOldRoot = `0x${BigInt(oldRootHex).toString(16).padStart(64, '0')}`;

        if (actualOnChainRoot !== normalizedOldRoot) {
            throw new Error(
                `Server tree is out of sync with on-chain state.\n` +
                `  Server oldRoot : ${normalizedOldRoot}\n` +
                `  On-chain root  : ${actualOnChainRoot}\n` +
                `→ Delete leaves.json and restart the server to re-sync.`
            );
        }

        const { auth } = await generateUpdateProof(
            oldRootHex,
            newRootHex,
            newLeafHex,
            leafIndex,
            oldLeafHex,
            proofRes
        );

        const tx = await contract.updateRoot(newRootHex, newLeafHex, leafIndex, auth);
        const receipt = await tx.wait();
        console.log(`[✅] Root updated on-chain! Tx: ${receipt.hash}`);
        return receipt.hash;
    } catch (err) {
        console.error('[❌] Failed to update root on-chain:', err);
        throw err;
    }
}
