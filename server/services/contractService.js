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
