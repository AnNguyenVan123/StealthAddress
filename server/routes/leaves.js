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
    getLeafMap,
    getPoseidon,
    getF,
    getIsTreeSynced,
    updateLeafByIndex
} from '../services/merkleService.js';
import { updateRootOnChain } from '../services/contractService.js';

const router = Router();

router.post('/', async (req, res) => {
    const { address, leaf } = req.body;

    // Reject if the server tree is out of sync with on-chain to avoid inserting
    // locally and then generating a ZK proof that will always fail verification.
    if (!getIsTreeSynced()) {
        return res.status(409).json({
            error:
                'Server tree is out of sync with the on-chain root. ' +
                'Delete leaves.json and restart the server to re-sync before inserting new leaves.',
        });
    }
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
        return res.json({
            success: true,
            index: existingIndex,
            leaf,
            newRoot: getCurrentRootHex(), // root didn't change
            txHash: null,
            message: 'Leaf already exists, returning existing coordinates.'
        });
    }

    // indexCommitment is the public AA salt — computed from index + address
    const { index } = computeIndexCommitment(address);

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
        leaf,                                  // k stored in the tree
        newRoot,
        txHash,
        totalLeaves: getLeaves().length,
    });
});

router.get('/find/:leafKey', (req, res) => {
    const { leafKey } = req.params;
    const { address } = req.query;

    console.log("Leafkey", leafKey);
    console.log("Address", address);
    if (!leafKey) {
        return res.status(400).json({ error: "Missing leafKey path parameter." });
    }

    if (!hasLeaf(leafKey)) {
        return res.json({ found: false });
    }

    const index = findLeafIndex(leafKey);

    // If address is provided, recompute indexCommitment; otherwise omit it.
    let indexCommitment = null;
    if (address) {
        try {
            indexCommitment = computeIndexCommitmentForIndex(index, address);
        } catch {
            return res.status(400).json({ error: 'Invalid address format.' });
        }
    }

    return res.json({
        found: true,
        index,
        indexCommitment,
        newRoot: getCurrentRootHex(),
    });
});

router.post('/recovery-proof', async (req, res) => {
    const { index, newLeaf } = req.body;
    if (index === undefined || index === null || !newLeaf) {
        return res.status(400).json({ error: "Missing index or newLeaf" });
    }

    try {
        const leafMap = getLeafMap();           // sparse: index (string) → hex
        const oldLeafHex = leafMap[String(index)] ?? ('0x' + '0'.repeat(64));
        const oldRootHex = getCurrentRootHex();

        // Fetch sibling path for the EXISTING tree state (before update)
        const { rawProof: proofRes } = createMerkleProof(Number(index));

        // Build new root by walking the sibling path with the new leaf value
        const poseidon = getPoseidon();
        const F = getF();
        let hash = F.e(BigInt(newLeaf));
        for (let i = 0; i < proofRes.siblings.length; i++) {
            const sibling = F.e(BigInt(proofRes.siblings[i][0]));
            const bit = proofRes.pathIndices[i];
            hash = bit === 0
                ? poseidon([hash, sibling])
                : poseidon([sibling, hash]);
        }
        const newRootHex = '0x' + F.toObject(hash).toString(16).padStart(64, '0');

        // Generate ZK proof via zkService
        const { generateUpdateProof } = await import('../services/zkService.js');
        const { auth } = await generateUpdateProof(
            oldRootHex,
            newRootHex,
            newLeaf,
            index,
            oldLeafHex,
            proofRes
        );

        return res.json({
            success: true,
            newRoot: newRootHex,
            auth
        });
    } catch (error) {
        console.error("[recovery-proof] Error:", error);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/sync-recovery', async (req, res) => {
    const { index, newLeaf } = req.body;
    if (index === undefined || index === null || !newLeaf) {
        return res.status(400).json({ error: "Missing index or newLeaf" });
    }

    try {
        const success = updateLeafByIndex(index, newLeaf);
        if (!success) {
            return res.status(404).json({ error: "Leaf not found on server" });
        }
        return res.json({ success: true });
    } catch (error) {
        console.error("[sync-recovery] Error:", error);
        return res.status(500).json({ error: error.message });
    }
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
