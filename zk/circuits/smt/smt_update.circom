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

template SMTUpdate(levels) {
    // Public Inputs
    signal input oldRoot;
    signal input newRoot;
    signal input index;
    signal input newLeaf;
   
    // Private Inputs
    signal input oldLeaf;
    signal input siblings[levels];

    // 1. Verify oldRoot
    component oldHashers[levels];
    component oldMuxers[levels];
    signal oldHashes[levels + 1];
    oldHashes[0] <== oldLeaf;

    component num2bits = Num2Bits(levels);
    num2bits.in <== index;

    for (var i = 0; i < levels; i++) {
        oldHashers[i] = Poseidon(2);
        oldMuxers[i] = DualMux();

        oldMuxers[i].in[0] <== oldHashes[i];
        oldMuxers[i].in[1] <== siblings[i];
        oldMuxers[i].s <== num2bits.out[i];

        oldHashers[i].inputs[0] <== oldMuxers[i].out[0];
        oldHashers[i].inputs[1] <== oldMuxers[i].out[1];

        oldHashes[i + 1] <== oldHashers[i].out;
    }
    oldRoot === oldHashes[levels];

    // 2. Verify newRoot with same siblings
    component newHashers[levels];
    component newMuxers[levels];
    signal newHashes[levels + 1];
    newHashes[0] <== newLeaf;

    for (var i = 0; i < levels; i++) {
        newHashers[i] = Poseidon(2);
        newMuxers[i] = DualMux();

        newMuxers[i].in[0] <== newHashes[i];
        newMuxers[i].in[1] <== siblings[i];
        newMuxers[i].s <== num2bits.out[i];

        newHashers[i].inputs[0] <== newMuxers[i].out[0];
        newHashers[i].inputs[1] <== newMuxers[i].out[1];

        newHashes[i + 1] <== newHashers[i].out;
    }
    newRoot === newHashes[levels];
}

component main {public [oldRoot, newRoot, index, newLeaf]} = SMTUpdate(20);
