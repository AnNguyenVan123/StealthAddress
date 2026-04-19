import fs from 'fs';
import { buildPoseidon } from 'circomlibjs';
import { PoseidonSparseMerkleTree } from '../lib/PoseidonSparseMerkleTree.js';
import { LEAVES_FILE } from '../config/index.js';
import { contract } from '../config/index.js';
import { rootToHex, shortHash } from '../utils/helpers.js';

// ─── Persistence schema ───────────────────────────────────────────────────────
//
//  leaves.json  (new sparse format)
//  {
//    "version": 2,
//    "nextIndex": <number>,            ← monotonically-increasing counter
//    "leafMap": { "<index>": "0x..." },← index (string) → commitment hex
//    "tree": { "depth": 20, "nodes": [...] }  ← sparse node snapshot
//  }
//
//  Backward-compat: if the file still contains the old array format (version 1)
//  it is migrated automatically on first load.

const SCHEMA_VERSION = 2;

// ─── Module-level state ───────────────────────────────────────────────────────
let poseidon;
let F;
let poseidonHash;

/** Map<number, string>  index → commitment hex */
let leafMap = new Map();

/** Monotonically-increasing; never decremented even after a delete */
let nextIndex = 0;

/** The live sparse tree */
let tree;

/**
 * True when the server's local tree root is confirmed to match the on-chain
 * root. Set to false when a mismatch is detected at startup. Leaf insertions
 * MUST be rejected while this is false to avoid generating ZK proofs that
 * will always fail verification.
 */
let isTreeSynced = true;

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadStore() {
    if (!fs.existsSync(LEAVES_FILE)) {
        return null; // fresh start
    }
    const raw = JSON.parse(fs.readFileSync(LEAVES_FILE, 'utf8'));
    return raw;
}

/**
 * Migrate old array-format leaves.json (version 1) to the version-2 schema.
 * Returns a v2-shaped plain object (tree snapshot is absent; will be rebuilt).
 */
function migrateV1(arr) {
    console.log(`[🔄] Migrating leaves.json from v1 (array, ${arr.length} entries) to v2…`);
    const leafMapObj = {};
    arr.forEach((hex, idx) => {
        leafMapObj[String(idx)] = hex;
    });
    return {
        version: SCHEMA_VERSION,
        nextIndex: arr.length,
        leafMap: leafMapObj,
        tree: null, // will be computed by initTree
    };
}

function buildLeafMap(leafMapObj) {
    const m = new Map();
    for (const [k, v] of Object.entries(leafMapObj)) {
        m.set(Number(k), v);
    }
    return m;
}

function saveStore() {
    // Convert Map to plain object for JSON
    const leafMapObj = {};
    for (const [k, v] of leafMap.entries()) {
        leafMapObj[String(k)] = v;
    }
    const payload = {
        version: SCHEMA_VERSION,
        nextIndex,
        leafMap: leafMapObj,
        tree: tree ? tree.serialize() : null,
    };
    fs.writeFileSync(LEAVES_FILE, JSON.stringify(payload, null, 2));
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Build the Poseidon hasher, restore (or reconstruct) the sparse tree from disk,
 * then sync the on-chain root if it has drifted.
 */
export async function initTree() {
    poseidon = await buildPoseidon();
    F = poseidon.F;

    poseidonHash = (inputs) => {
        const hashInF = poseidon(inputs);
        const hex = F.toObject(hashInF).toString(16).padStart(64, '0');
        return BigInt('0x' + hex);
    };

    // ── Load / migrate persistence ────────────────────────────────────────────
    let stored = loadStore();

    if (!stored) {
        // Completely fresh start
        leafMap = new Map();
        nextIndex = 0;
        tree = new PoseidonSparseMerkleTree(poseidonHash, 20, 0n);
        saveStore();
    } else if (Array.isArray(stored)) {
        // v1: old array format — migrate
        stored = migrateV1(stored);
        leafMap = buildLeafMap(stored.leafMap);
        nextIndex = stored.nextIndex;
        // Rebuild sparse tree from the leaf map
        tree = new PoseidonSparseMerkleTree(poseidonHash, 20, 0n);
        for (const [idx, hex] of leafMap.entries()) {
            tree.update(idx, BigInt(hex));
        }
        saveStore(); // persist new format immediately
    } else {
        // v2: current format
        leafMap = buildLeafMap(stored.leafMap);
        nextIndex = stored.nextIndex;

        if (stored.tree) {
            // Fast path: restore from node snapshot (no re-hashing needed)
            tree = PoseidonSparseMerkleTree.deserialize(stored.tree, poseidonHash, 0n);
        } else {
            // Fallback: recompute from leaf map
            tree = new PoseidonSparseMerkleTree(poseidonHash, 20, 0n);
            for (const [idx, hex] of leafMap.entries()) {
                tree.update(idx, BigInt(hex));
            }
        }
    }

    console.log(`[🌳] Sparse tree loaded. Active leaves: ${leafMap.size}, nextIndex: ${nextIndex}`);
    console.log(`[🌳] Root: ${rootToHex(tree.root)}`);

    // ── Sync on-chain root at startup ─────────────────────────────────────────
    if (contract) {
        try {
            const currentOnchainRoot = await contract.root();
            const calculatedRoot = rootToHex(tree.root);

            const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';

            if (currentOnchainRoot === ZERO_ROOT) {
                // Fresh deployment: on-chain root is still bytes32(0).
                // Call initRoot() to seed it with the Poseidon empty-tree root.
                console.log(`[🌱] On-chain root is zero. Calling initRoot(${calculatedRoot})...`);

                // ── Pre-flight staticCall to surface the real revert reason ──
                // Alchemy on Sepolia returns data=null for estimateGas failures,
                // hiding the actual require() message. A staticCall reveals it.
                let shouldSendTx = true;
                try {
                    await contract.initRoot.staticCall(calculatedRoot);
                } catch (staticErr) {
                    const reason = staticErr.reason || staticErr.message || '';
                    if (reason.includes('already initialised')) {
                        // initRoot was already called (e.g. by the deploy script).
                        console.log(`[ℹ️] initRoot already called — contract root is already set.`);
                        shouldSendTx = false;
                    } else {
                        // Unexpected failure — log and skip (server will still start).
                        console.error(`[❌] initRoot staticCall failed: ${reason}`);
                        console.error(`     On-chain root remains 0. ZK proofs will fail until root is aligned.`);
                        console.error(`     → Redeploy the contract and restart the server.`);
                        shouldSendTx = false;
                    }
                }

                if (shouldSendTx) {
                    // staticCall passed — send the real tx with a fixed gasLimit
                    // to bypass Alchemy returning data=null during estimateGas.
                    const tx = await contract.initRoot(calculatedRoot, { gasLimit: 150_000 });
                    const receipt = await tx.wait();
                    console.log(`[✅] On-chain root initialised to: ${calculatedRoot} (tx: ${receipt.hash})`);
                } else {
                    // Re-read the fresh on-chain root to confirm sync state.
                    const freshRoot = await contract.root();
                    if (freshRoot === calculatedRoot) {
                        console.log(`[✅] On-chain root in sync: ${freshRoot}`);
                    } else if (freshRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                        console.warn(`[🚨] ROOT MISMATCH! On-chain: ${freshRoot} | Server: ${calculatedRoot}`);
                        console.warn(`     Delete leaves.json and restart if server state is stale.`);
                    } else {
                        console.error(`[❌] On-chain root is still zero. Redeploy the contract and restart.`);
                    }
                }

            } else if (currentOnchainRoot !== calculatedRoot) {
                isTreeSynced = false;
                console.log(
                    `[🚨] ROOT MISMATCH! Server: ${calculatedRoot} | On-chain: ${currentOnchainRoot}`,
                );
                console.log(`[⚠️] Cannot auto-sync — ZK proofs are required for each update.`);
                console.log(`[⚠️] Leaf insertions are BLOCKED until the tree is re-synced.`);
                console.log(`[⚠️] Delete leaves.json and restart the server to reset.`);
            } else {
                isTreeSynced = true;
                console.log(`[✅] On-chain root already in sync: ${currentOnchainRoot}`);
            }
        } catch (err) {
            console.warn(`[⚠️] Could not check/sync root on-chain during init: ${err.message}`);
        }
    }
}



// ─── Commitment computation ───────────────────────────────────────────────────

/**
 * Compute indexCommitment = poseidon(poseidon(index, 0), address) for a
 * specific index slot.
 *
 * @param {number} index
 * @param {string} address  0x-prefixed hex address
 * @returns {string} indexCommitmentHex
 */
export function computeIndexCommitmentForIndex(index, address) {
    const addressBigInt = BigInt(address);
    const indexHashField = poseidon([BigInt(index), 0n]);
    const indexHashBigInt = F.toObject(indexHashField);
    
    // Add in the finite field before hashing based on updated formula
    const sum = F.add(F.e(indexHashBigInt), F.e(addressBigInt));
    
    const commitmentField = poseidon([sum]);
    const indexCommitmentBigInt = F.toObject(commitmentField);
    return '0x' + indexCommitmentBigInt.toString(16).padStart(64, '0');
}

/**
 * Compute indexCommitment = poseidon(poseidon(index, 0), address) for the
 * *next* available index slot.
 *
 * @param {string} address  0x-prefixed hex address
 * @returns {{ index: number, indexCommitmentHex: string }}
 */
export function computeIndexCommitment(address) {
    const index = nextIndex; // next slot (may be > leafMap.size if deletions happened)

    return { index };
}

// ─── Leaf write operations ────────────────────────────────────────────────────

/**
 * Insert a new leaf at nextIndex using O(depth) sparse update.
 * Advances nextIndex by 1.
 *
 * @param {number} index               - The slot to write (from computeIndexCommitment)
 * @param {string} indexCommitmentHex  - 0x-prefixed hex commitment
 */
export function insertLeaf(index, indexCommitmentHex) {
    leafMap.set(index, indexCommitmentHex);
    nextIndex = index + 1;
    tree.update(index, BigInt(indexCommitmentHex));
    saveStore();
}

/**
 * Delete (zero out) a leaf at the given index — O(depth), no rebuild.
 * The index slot is permanently retired; nextIndex is NOT decremented.
 *
 * @param {string} indexCommitmentHex  - commitment to locate
 * @returns {number|null}              - the index that was removed, or null if not found
 */
export function removeLeaf(indexCommitmentHex) {
    const index = findLeafIndex(indexCommitmentHex);
    if (index === null) return null;

    leafMap.delete(index);
    tree.update(index, 0n); // set leaf to zero — O(depth)
    saveStore();
    return index;
}

/**
 * Rollback: undo the last insertLeaf() call.
 * Zeros out the leaf at (nextIndex - 1) and decrements nextIndex.
 * Safe to call even if the leaf was never yet inserted (no-op).
 */
export function rollbackLastLeaf() {
    if (nextIndex === 0) return;
    const lastIndex = nextIndex - 1;
    leafMap.delete(lastIndex);
    tree.update(lastIndex, 0n);
    nextIndex = lastIndex;
    saveStore();
}

/**
 * Update (replace) an existing leaf's commitment in-place — O(depth).
 *
 * @param {string} oldCommitmentHex
 * @param {string} newCommitmentHex
 * @returns {boolean}
 */
export function updateLeaf(oldCommitmentHex, newCommitmentHex) {
    const index = findLeafIndex(oldCommitmentHex);
    if (index === null) return false;

    leafMap.set(index, newCommitmentHex);
    tree.update(index, BigInt(newCommitmentHex));
    saveStore();
    return true;
}

export function updateLeafByIndex(index, newCommitmentHex) {
    const idx = Number(index);
    if (!leafMap.has(idx)) return false;
    leafMap.set(idx, newCommitmentHex);
    tree.update(idx, BigInt(newCommitmentHex));
    saveStore();
    
    // Also re-verify on-chain sync
    initTree(); 
    return true;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/**
 * Find the position index of a commitment, or null if absent.
 * @param {string} commitment
 * @returns {number|null}
 */
export function findLeafIndex(commitment) {
    for (const [idx, hex] of leafMap.entries()) {
        if (hex === commitment) return idx;
    }
    return null;
}

/**
 * Check whether a commitment already exists in the tree.
 * @param {string} commitmentHex
 * @returns {boolean}
 */
export function hasLeaf(commitmentHex) {
    return findLeafIndex(commitmentHex) !== null;
}

/**
 * Returns all active commitments as an array in insertion-index order.
 * Deleted slots are omitted.
 */
export function getLeaves() {
    const sorted = [...leafMap.entries()].sort(([a], [b]) => a - b);
    return sorted.map(([, hex]) => hex);
}

/**
 * Returns the leaf map as a plain object (index → hex) for serialisation.
 */
export function getLeafMap() {
    const obj = {};
    for (const [k, v] of leafMap.entries()) obj[k] = v;
    return obj;
}

export function getTree() {
    return tree;
}

export function getF() {
    return F;
}

export function getPoseidon() {
    return poseidon;
}

export function getNextIndex() {
    return nextIndex;
}

export function getCurrentRootHex() {
    return rootToHex(tree.root);
}

/** Returns true when the server tree is confirmed in sync with the on-chain root. */
export function getIsTreeSynced() {
    return isTreeSynced;
}

// ─── Proof generation ─────────────────────────────────────────────────────────

/**
 * Create a Merkle proof for the leaf at the given positional index.
 * Output format is compatible with zkService.js (siblings wrapped in arrays,
 * pathIndices as bitmask BigInt).
 *
 * @param {number} index
 * @returns {{ rawProof, flattenedSiblings: string[], pathIndicesFlags: BigInt, root: string }}
 */
export function createMerkleProof(index) {
    const proof = tree.createProof(index);

    const flattenedSiblings = proof.siblings.map(
        ([s]) => '0x' + s.toString(16).padStart(64, '0'),
    );

    let pathIndicesFlags = 0n;
    for (let i = 0; i < proof.pathIndices.length; i++) {
        if (proof.pathIndices[i] === 1) {
            pathIndicesFlags |= 1n << BigInt(i);
        }
    }

    return {
        rawProof: proof,
        flattenedSiblings,
        pathIndicesFlags,
        root: '0x' + proof.root.toString(16).padStart(64, '0'),
    };
}

// ─── Debug helpers ────────────────────────────────────────────────────────────

export function visualizeTree() {
    if (!tree) {
        console.log('Tree not yet initialised!');
        return;
    }

    console.log('\n==================================================');
    console.log('🌳 POSEIDON SPARSE MERKLE TREE');
    console.log('==================================================');
    console.log(`Depth     : ${tree.depth}`);
    console.log(`Root      : ${shortHash(tree.root)} (${rootToHex(tree.root)})`);
    console.log(`Slots used: ${leafMap.size} active  |  nextIndex = ${nextIndex}`);
    console.log(`Stored nodes (non-zero): ${tree._nodes.size}\n`);

    const sorted = [...leafMap.entries()].sort(([a], [b]) => a - b);
    const displayLimit = 8;
    for (let i = 0; i < Math.min(sorted.length, displayLimit); i++) {
        const [idx, hex] = sorted[i];
        console.log(`  ├─ [${idx}]: ${shortHash(BigInt(hex))}`);
    }
    if (sorted.length > displayLimit) {
        console.log(`  └─ … (+${sorted.length - displayLimit} more active leaves)`);
    }
    console.log('==================================================\n');
}

export function getTreeStructure() {
    const sorted = [...leafMap.entries()].sort(([a], [b]) => a - b);
    return {
        activeLeaves: Object.fromEntries(sorted.map(([idx, hex]) => [idx, hex])),
        storedNodes: tree._nodes.size,
        note: 'Sparse tree — only non-zero nodes are stored in memory.',
    };
}
