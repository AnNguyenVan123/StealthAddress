snarkjs zkey contribute smt_0000.zkey smt_final.zkey --name="1st" -v -e="random"
snarkjs zkey export verificationkey smt_final.zkey vk.json
snarkjs zkey export solidityverifier smt_final.zkey SMTUpdateVerifier.sol
