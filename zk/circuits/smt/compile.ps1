circom smt_update.circom --r1cs --wasm --sym
snarkjs groth16 setup smt_update.r1cs powersOfTau28_hez_final_15.ptau smt_0000.zkey
snarkjs zkey contribute smt_0000.zkey smt_final.zkey -e "random_entropy"
snarkjs zkey export verificationkey smt_final.zkey vk.json
snarkjs zkey export solidityverifier smt_final.zkey SMTUpdateVerifier.sol
