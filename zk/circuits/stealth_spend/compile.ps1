circom stealth.circom --r1cs --wasm --sym
snarkjs groth16 setup stealth.r1cs pot16_final.ptau stealth_0000.zkey
snarkjs zkey contribute stealth_0000.zkey stealth_final.zkey --name="1st" -v -e="random"
snarkjs zkey export verificationkey stealth_final.zkey verification_key.json
snarkjs zkey export solidityverifier stealth_final.zkey StealthSpendVerifier.sol
