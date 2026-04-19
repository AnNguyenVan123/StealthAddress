pragma circom 2.0.0;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    out[0] <== (in[1] - in[0])*s + in[0];
    out[1] <== (in[0] - in[1])*s + in[1];
}

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices;

    component hashers[levels];
    component muxers[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    component num2bits = Num2Bits(levels);
    num2bits.in <== pathIndices;

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);
        muxers[i] = DualMux();

        muxers[i].in[0] <== levelHashes[i];
        muxers[i].in[1] <== pathElements[i];
        muxers[i].s <== num2bits.out[i];

        hashers[i].inputs[0] <== muxers[i].out[0];
        hashers[i].inputs[1] <== muxers[i].out[1];

        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[levels];
}

template StealthAccountZK(levels) {
    // Public Inputs (What the smart contract sees)
    signal input root;
    signal input indexCommitment;

    // Private Inputs (Only known to the client)
    signal input x;                 // spending private key
    signal input sharedSecretHash;  // hash(sharedSecret)
    signal input merkleProof[levels];
    signal input pathIndices;  // the index in the tree

    // 1. k = hash(x) --> The value of the leaf
    component hash_x = Poseidon(1);
    hash_x.inputs[0] <== x;
    signal k;
    k <== hash_x.out;

    // 2. Verify that index_commitment = hash(indexHash, sharedSecretHash)
    // First, hash(index)  (Poseidon of [index, 0] based on our zkIntegration logic)
    component index_hash = Poseidon(2);
    index_hash.inputs[0] <== pathIndices;
    index_hash.inputs[1] <== 0;

    // Then hash(indexHash + sharedSecretHash)
    component commitment_hash = Poseidon(1);
    commitment_hash.inputs[0] <== index_hash.out + sharedSecretHash;

    // Ensure the required indexCommitment matches the computed one
    indexCommitment === commitment_hash.out;

    // 3. Verify that the leaf 'k' is valid in the tree
    component treeChecker = MerkleTreeChecker(levels);
    treeChecker.leaf <== k;
    treeChecker.root <== root;
    for (var i = 0; i < levels; i++) {
        treeChecker.pathElements[i] <== merkleProof[i];
    }
    treeChecker.pathIndices <== pathIndices;
}

// Instantiate with tree depth 20
component main {public [root, indexCommitment]} = StealthAccountZK(20);
