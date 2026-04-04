import { Router } from 'express';
import {
    getTree,
    getLeaves,
    getLeafMap,
    findLeafIndex,
    createMerkleProof,
    getCurrentRootHex,
    visualizeTree,
    getTreeStructure,
} from '../services/merkleService.js';

const router = Router();

/**
 * GET /tree  (also reachable as GET / for backwards compatibility)
 * Return tree metadata: root, depth, leaf count, all leaves,
 * and the sparse leafMap (index → commitment) for the client scanner.
 */
function treeHandler(req, res) {
    const tree = getTree();
    res.json({
        root: getCurrentRootHex(),
        depth: tree.depth,
        leafCount: getLeaves().length,
        leaves: getLeaves(),
        leafMap: getLeafMap(),
    });
}

router.get('/', treeHandler);
router.get('/tree', treeHandler);

/**
 * GET /proof/:leaf
 * Return a Merkle proof for the requested leaf commitment.
 */
router.get('/proof/:leaf', (req, res) => {
    const leaf = req.params.leaf;
    const index = findLeafIndex(leaf);

    if (index === -1) {
        return res.status(404).json({ error: 'Leaf not found in tree.' });
    }

    try {
        const { flattenedSiblings, pathIndicesFlags, root } = createMerkleProof(index);
        return res.json({
            leaf,
            proof: flattenedSiblings,
            pathIndices: pathIndicesFlags.toString(),
            root,
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

/**
 * GET /debug/visualize-tree
 * Log the tree to stdout and return a JSON snapshot.
 */
router.get('/debug/visualize-tree', (req, res) => {
    const tree = getTree();
    visualizeTree();

    res.json({
        root: getCurrentRootHex(),
        depth: tree.depth,
        leafCount: tree.leaves ? tree.leaves.length : getLeaves().length,
        structure: getTreeStructure(),
    });
});

export default router;
