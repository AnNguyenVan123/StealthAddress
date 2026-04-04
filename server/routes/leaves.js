import { Router } from 'express';
import {
    computeIndexCommitment,
    computeIndexCommitmentForIndex,
    insertLeaf,
    removeLeaf,
    rollbackLastLeaf,
    getCurrentRootHex,
    createMerkleProof,
    findLeafIndex,
    hasLeaf,
    getLeaves,
} from '../services/merkleService.js';
import { updateRootOnChain } from '../services/contractService.js';

const router = Router();

/**
 * POST /leaves
 * Register a new stealth account leaf in the Merkle tree.
 *
 * Body: {
 *   address: string,  // 0x-prefixed identity address (computeAddress(spendPub))
 *   leaf:    string,  // 0x-prefixed k = poseidon(spendPriv)  ← actual tree leaf
 * }
 *
 * The `leaf` (k) is the secret commitment only the account owner can compute.
 * The `indexCommitment` = poseidon(poseidon(index,0), address) is the public
 * identifier used as the AA factory CREATE2 salt — it is NOT what goes into
 * the Merkle tree.
 *
 * Atomic flow:
 *   1. Compute indexCommitment from (index, address) — for the factory.
 *   2. Insert `leaf` (k) into the sparse tree — O(depth), no rebuild.
 *   3. Push new root on-chain. If that fails, rollback the local insert.
 */
router.post('/', async (req, res) => {
    const { address, leaf } = req.body;

    if (!address) {
        return res.status(400).json({
            error: "Missing 'address' field. Must be a 0x-prefixed hex address.",
        });
    }
    if (!leaf) {
        return res.status(400).json({
            error: "Missing 'leaf' field. Must be k=poseidon(spendPriv) as a 0x-prefixed hex.",
        });
    }

    try { BigInt(address); } catch {
        return res.status(400).json({ error: 'Invalid address format.' });
    }
    try { BigInt(leaf); } catch {
        return res.status(400).json({ error: 'Invalid leaf format. Must be a 0x-prefixed hex string.' });
    }

    // Prevent duplicating the leaf, but return success (e.g. for wallet imports)
    if (hasLeaf(leaf)) {
        const existingIndex = findLeafIndex(leaf);
        const existingIndexCommitment = computeIndexCommitmentForIndex(existingIndex, address);
        return res.json({
            success: true,
            index: existingIndex,
            indexCommitment: existingIndexCommitment,
            leaf,
            newRoot: getCurrentRootHex(), // root didn't change
            txHash: null,
            message: 'Leaf already exists, returning existing coordinates.'
        });
    }

    // indexCommitment is the public AA salt — computed from index + address
    const { index, indexCommitmentHex } = computeIndexCommitment(address);

    const oldRootHex = getCurrentRootHex();
    const oldLeafHex = '0x' + '0'.repeat(64); // inserting into an empty slot

    // Fetch Merkle proof BEFORE inserting — siblings reflect the pre-insert tree
    const { rawProof: proofRes } = createMerkleProof(index);

    // Insert the actual leaf value (k) into the tree — NOT indexCommitment
    insertLeaf(index, leaf);
    const newRoot = getCurrentRootHex();

    // Push on-chain; rollback on failure
    let txHash = null;
    try {
        txHash = await updateRootOnChain(
            oldRootHex,
            newRoot,
            leaf,       // the actual new leaf value pushed to the chain's SMT verifier
            index,
            oldLeafHex,
            proofRes
        );
    } catch (err) {
        console.error('[⚠️] On-chain update failed — rolling back:', err.message);
        rollbackLastLeaf();
        return res.status(500).json({
            error: 'On-chain update failed, changes rolled back: ' + err.message,
        });
    }

    return res.json({
        success: true,
        index,
        indexCommitment: indexCommitmentHex,  // factory CREATE2 salt
        leaf,                                  // k stored in the tree
        newRoot,
        txHash,
        totalLeaves: getLeaves().length,
    });
});

/**
 * DELETE /leaves/:indexCommitment
 * Zero out a leaf (e.g. if downstream AA deployment failed).
 * Does NOT reassign the index slot — nextIndex is unchanged.
 * O(depth) operation; the rest of the tree is untouched.
 */
router.delete('/:indexCommitment', async (req, res) => {
    const { indexCommitment } = req.params;

    const idx = findLeafIndex(indexCommitment);
    if (idx === null) {
        return res.status(404).json({ error: 'Leaf not found.' });
    }

    const oldRootHex = getCurrentRootHex();
    const oldLeafHex = indexCommitment; // We are removing this leaf
    const newLeafHex = "0x" + "0".repeat(64); // zero out

    // Fetch proof BEFORE deleting so siblings reflect the current tree
    const { rawProof: proofRes } = createMerkleProof(idx);

    // Zero out the leaf in the sparse tree — O(depth)
    removeLeaf(indexCommitment);
    const newRoot = getCurrentRootHex();

    // Best-effort on-chain sync
    let txHash = null;
    try {
        txHash = await updateRootOnChain(
            oldRootHex,
            newRoot,
            newLeafHex, // 0 for delete
            idx,
            oldLeafHex,
            proofRes
        );
    } catch (err) {
        console.warn('[⚠️] Could not sync root on-chain after deletion:', err.message);
    }

    return res.json({ success: true, newRoot, txHash, totalLeaves: getLeaves().length });
});

export default router;
