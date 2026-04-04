const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const { groth16 } = require("snarkjs");

async function run() {
    try {
        console.log("Building Poseidon and preparing inputs...");
        const poseidon = await buildPoseidon();
        
        const x = "123456789"; 
        const k_hash = poseidon([x]);
        const k = poseidon.F.toString(k_hash);
        
        const index = 1;
        const stealthEOA = "0x0facfa00db3a14b2d00c4015bdc7e7955ce99781f819f1828cc1af574680b699";
        const stealthEOABigInt = BigInt(stealthEOA).toString();
        
        const index_hash = poseidon([index, 0]);
        const commitment_hash = poseidon([index_hash, stealthEOABigInt]);
        const indexCommitment = poseidon.F.toString(commitment_hash);
        
        const levels = 20;
        const merkleProof = Array(levels).fill("0");
        const pathIndices = index;
        
        let current = k_hash;
        for (let i = 0; i < levels; i++) {
            if ((pathIndices >> i) & 1) {
                current = poseidon([0, current]);
            } else {
                current = poseidon([current, 0]);
            }
        }
        const root = poseidon.F.toString(current);
        
        const input = {
            root: root,
            indexCommitment: indexCommitment,
            x: x,
            stealthEOA: stealthEOABigInt,
            merkleProof: merkleProof,
            pathIndices: pathIndices
        };
        
        const circuitDir = path.join(__dirname, "../zk/circuits/stealth_spend");
        
        fs.writeFileSync(path.join(circuitDir, "input.json"), JSON.stringify(input, null, 2));
        console.log("Input written to input.json in stealth_spend dir");
        
        console.log("Generating Proof...");
        // the zkey and wasm might be outdated because we changed the circom file but didn't successfully fully compile it because Windows cmd.
        const { proof, publicSignals } = await groth16.fullProve(
             input,
             path.join(circuitDir, "stealth_js/stealth.wasm"),
             path.join(circuitDir, "stealth_0000.zkey")
        );
        console.log("Proof successfully generated!");
        fs.writeFileSync(path.join(circuitDir, "proof.json"), JSON.stringify(proof, null, 2));
        fs.writeFileSync(path.join(circuitDir, "public.json"), JSON.stringify(publicSignals, null, 2));
        
        console.log("Verifying Proof...");
        const vKey = JSON.parse(fs.readFileSync(path.join(circuitDir, "verification_key.json")));
        const res = await groth16.verify(vKey, publicSignals, proof);
        if (res) {
            console.log("=========================================");
            console.log("✅ Proof VERIFIED successfully!");
            console.log("=========================================");
        } else {
            console.log("=========================================");
            console.log("❌ Proof verification FAILED!");
            console.log("=========================================");
        }
    } catch (e) {
        console.error("TEST FAILED:", e.message);
    }
}

run();
