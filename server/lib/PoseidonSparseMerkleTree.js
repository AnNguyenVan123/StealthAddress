/**
 * PoseidonSparseMerkleTree
 *
 * A fixed-depth (default 20), binary Sparse Merkle Tree backed by Poseidon.
 *
 * Why sparse instead of incremental?
 *  - Incremental trees only support appending. Removing a leaf requires a
 *    full O(N) rebuild of the entire tree.
 *  - This sparse implementation stores only touched (non-zero) nodes in a
 *    Map keyed by "level:nodeIndex". All un-touched positions implicitly
 *    hold a pre-computed zero-hash, so update/delete are both O(depth).
 *
 * Proof format is identical to what @zk-kit/incremental-merkle-tree emits:
 *  - siblings: Array of [BigInt]  (one sibling per level)
 *  - pathIndices: number[]        (bit per level; 0 = current is left child)
 *  - root: BigInt
 *
 * This means zkService.js requires NO changes.
 */
export class PoseidonSparseMerkleTree {
    /**
     * @param {function} hashFn   - (inputs: BigInt[]) => BigInt  (Poseidon wrapper)
     * @param {number}   depth    - tree depth (default 20, matching circuit)
     * @param {BigInt}   zeroLeaf - value used for empty leaves (default 0n)
     */
    constructor(hashFn, depth = 20, zeroLeaf = 0n) {
        this._hash = hashFn;
        this.depth = depth;
        this._zeroLeaf = zeroLeaf;

        // Pre-compute zero-hashes for each level bottom-up
        // zeroHashes[0] = empty leaf value
        // zeroHashes[k] = hash(zeroHashes[k-1], zeroHashes[k-1])
        this._zeroHashes = new Array(depth + 1);
        this._zeroHashes[0] = zeroLeaf;
        for (let i = 1; i <= depth; i++) {
            this._zeroHashes[i] = hashFn([this._zeroHashes[i - 1], this._zeroHashes[i - 1]]);
        }

        // Sparse node storage: "level:nodeIndex" -> BigInt
        // Only non-zero nodes are stored; everything else falls back to zeroHashes.
        this._nodes = new Map();
    }

    // ── Private node access ───────────────────────────────────────────────────

    _key(level, nodeIndex) {
        return `${level}:${nodeIndex}`;
    }

    _getNode(level, nodeIndex) {
        return this._nodes.get(this._key(level, nodeIndex)) ?? this._zeroHashes[level];
    }

    _setNode(level, nodeIndex, value) {
        if (value === this._zeroHashes[level]) {
            // If the value equals the zero-hash for this level, remove the entry
            // so the map stays compact (the zero-hash is the implicit default).
            this._nodes.delete(this._key(level, nodeIndex));
        } else {
            this._nodes.set(this._key(level, nodeIndex), value);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Current root hash (BigInt).
     * The root sits at level `depth`, node index 0.
     */
    get root() {
        return this._getNode(this.depth, 0n);
    }

    /**
     * Insert or update a leaf at the given position index.
     * Set value to 0n (or zeroLeaf) to "delete" the leaf.
     *
     * @param {number|BigInt} leafIndex
     * @param {BigInt}        value
     */
    update(leafIndex, value) {
        let idx = BigInt(leafIndex);

        // Write leaf at level 0
        this._setNode(0, idx, value);

        let current = value;

        // Propagate up — O(depth)
        for (let level = 0; level < this.depth; level++) {
            const isRightChild = idx % 2n === 1n;
            const sibling = this._getNode(level, isRightChild ? idx - 1n : idx + 1n);

            current = isRightChild
                ? this._hash([sibling, current])
                : this._hash([current, sibling]);

            idx = idx >> 1n;
            this._setNode(level + 1, idx, current);
        }
    }

    /**
     * Generate a Merkle inclusion proof for a leaf at leafIndex.
     * Compatible with the zk-kit incremental-tree proof format.
     *
     * @param {number} leafIndex
     * @returns {{ leaf: BigInt, siblings: [BigInt][], pathIndices: number[], root: BigInt }}
     */
    createProof(leafIndex) {
        const siblings = [];
        const pathIndices = [];

        let idx = BigInt(leafIndex);

        for (let level = 0; level < this.depth; level++) {
            const isRightChild = idx % 2n === 1n;
            const siblingIdx = isRightChild ? idx - 1n : idx + 1n;

            siblings.push([this._getNode(level, siblingIdx)]);   // wrapped in array to match zk-kit
            pathIndices.push(isRightChild ? 1 : 0);              // 1 = current node is the right child

            idx = idx >> 1n;
        }

        return {
            leaf: this._getNode(0, BigInt(leafIndex)),
            siblings,
            pathIndices,
            root: this.root,
        };
    }

    /**
     * Retrieve the stored value at a leaf position.
     * Returns 0n (zeroLeaf) for empty slots.
     *
     * @param {number|BigInt} leafIndex
     * @returns {BigInt}
     */
    getLeaf(leafIndex) {
        return this._getNode(0, BigInt(leafIndex));
    }

    /**
     * Serialize to a plain object that can be JSON-stringified.
     * Only non-zero nodes are saved (sparse representation).
     *
     * Format:
     *   {
     *     "depth": 20,
     *     "nodes": [["level:idx", "0x..."], ...]   // only non-zero entries
     *   }
     */
    serialize() {
        const nodes = [];
        for (const [key, value] of this._nodes.entries()) {
            nodes.push([key, '0x' + value.toString(16).padStart(64, '0')]);
        }
        return { depth: this.depth, nodes };
    }

    /**
     * Restore a tree from a serialized snapshot (created by serialize()).
     *
     * @param {object}   snapshot
     * @param {function} hashFn
     * @param {BigInt}   [zeroLeaf]
     * @returns {PoseidonSparseMerkleTree}
     */
    static deserialize(snapshot, hashFn, zeroLeaf = 0n) {
        const smt = new PoseidonSparseMerkleTree(hashFn, snapshot.depth, zeroLeaf);
        for (const [key, hexValue] of snapshot.nodes) {
            smt._nodes.set(key, BigInt(hexValue));
        }
        return smt;
    }
}
