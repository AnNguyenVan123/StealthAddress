import * as snarkjs from 'snarkjs';
import {
    findLeafIndex,
    createMerkleProof,
    getF,
    getPoseidon,
} from './merkleService.js';
import { contract } from '../config/index.js';

// Paths to the compiled ZK circuit artifacts
const WASM_PATH = './zk/stealth_spending/stealth.wasm';
const ZKEY_PATH = './zk/stealth_spending/circuit_final.zkey';

const UPDATE_WASM_PATH = './zk/smt_updating/smt_update.wasm';
const UPDATE_ZKEY_PATH = './zk/smt_updating/smt_final.zkey';

/**
 * Generate a Groth16 ZK proof for a sparse tree root update.
 */
export async function generateUpdateProof(oldRootHex, newRootHex, newLeafHex, leafIndex, oldLeafHex, proofRes) {
    const circuitInputs = {
        oldRoot: BigInt(oldRootHex).toString(),
        newRoot: BigInt(newRootHex).toString(),
        leaf: BigInt(newLeafHex).toString(),
        index: leafIndex.toString(),
        oldLeaf: BigInt(oldLeafHex).toString(),
        siblings: proofRes.siblings.map((s) => BigInt(s[0]).toString())
    };

    console.log('[ZK] Generating SMT Update Proof...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        UPDATE_WASM_PATH,
        UPDATE_ZKEY_PATH
    );
    console.log('[ZK] Update Proof generated!');

    const auth = {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]],
        ],
        c: [proof.pi_c[0], proof.pi_c[1]],
    };

    return { auth, publicSignals };
}
//  * Generate a Groth16 proof for membership of the sender's account leaf in the Merkle tree.
//  *
//  * @param {string} senderIndexCommitment - 0x-prefixed hex, public identifier (for the AA)
//  * @param {string} spendPrivHex          - 0x-prefixed spending private key (private circuit input x)
//  * @param {string} senderStealthEOA      - the ephemeral stealth EOA the AA was deployed for
//  * @returns {{ auth: object, indexCommitment: string }}
//  */
export async function generateSpendProof(senderIndexCommitment, spendPrivHex, senderSharedSecretHash) {
    // The leaf stored in the tree is k = poseidon(spendPriv)
    const F = getF();
    const poseidon = getPoseidon();
    const kBigInt = F.toObject(poseidon([BigInt(spendPrivHex)]));
    const leafHex = '0x' + kBigInt.toString(16).padStart(64, '0');

    const index = findLeafIndex(leafHex);
    if (index === null) {
        throw new Error('Account leaf not found in tree. Was the account leaf published at creation time?');
    }

    const { rawProof: proofRes, pathIndicesFlags } = createMerkleProof(index);

    const currentOnchainRoot = await contract.root();

    // Sanity-check: manually recompute root from proof
    let hash = kBigInt;
    for (let i = 0; i < proofRes.siblings.length; i++) {
        const sibling = BigInt(proofRes.siblings[i][0]);
        const bit = (pathIndicesFlags >> BigInt(i)) & 1n;
        hash =
            bit === 0n
                ? F.toObject(poseidon([hash, sibling]))
                : F.toObject(poseidon([sibling, hash]));
    }
    console.log('[ZK] Recomputed root from proof:', hash.toString());

    const circuitInputs = {
        root: BigInt(currentOnchainRoot).toString(),
        indexCommitment: BigInt(senderIndexCommitment).toString(),
        // Private inputs
        x: BigInt(spendPrivHex).toString(),             // spendPriv → k = poseidon(x) in circuit
        sharedSecretHash: BigInt(senderSharedSecretHash).toString(), // matches indexCommitment = H(indexHash, sharedSecretHash)
        merkleProof: proofRes.siblings.map((s) => BigInt(s[0]).toString()),
        pathIndices: pathIndicesFlags.toString(),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        WASM_PATH,
        ZKEY_PATH,
    );

    console.log('[ZK] Public signals:', publicSignals);
    console.log('[ZK] Public root:', publicSignals[0]);
    console.log('[ZK] Public indexCommitment:', publicSignals[1]);

    // Convert snarkjs proof → Solidity-compatible format (swap G2 coordinates)
    const auth = {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]],
        ],
        c: [proof.pi_c[0], proof.pi_c[1]],
    };

    return { auth, indexCommitment: senderIndexCommitment };
}

/**
 * Encode the ZK proof + senderIndexCommitment into the ABI-encoded signature
 * that StealthAccount.validateUserOp() expects.
 *
 * @param {{ a, b, c }} auth
 * @param {string} senderIndexCommitment
 * @param {object} abiCoder - ethers AbiCoder instance
 * @returns {string} ABI-encoded hex signature
 */
export function encodeProofSignature(auth, senderIndexCommitment, abiCoder) {
    const a = auth.a.map((x) => BigInt(x).toString());
    const b = auth.b.map((row) => row.map((x) => BigInt(x).toString()));
    const c = auth.c.map((x) => BigInt(x).toString());

    const signature = abiCoder.encode(
        ['tuple(uint256[2] a,uint256[2][2] b,uint256[2] c)', 'uint256'],
        [{ a, b, c }, BigInt(senderIndexCommitment)],
    );

    console.log('[SIG] Signature length:', (signature.length - 2) / 2, 'bytes');
    return signature;
}
