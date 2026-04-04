# Privacy-Preserving Stealth Wallet

A comprehensive stealth wallet architecture enabling private crypto transfers and anonymous asset management on standard EVM networks. It leverages **Account Abstraction (ERC-4337)** and **Zero-Knowledge Proofs (zk-SNARKs)** to break the on-chain link between the sender and recipient, keeping transaction histories completely confidential.

## System Architecture

The project is split into four fully integrated components:

1. **`blockchain`**: Smart contracts for Stealth Accounts, custom Paymasters, and EntryPoint interactions. Contains the Groth16 Verifier and an on-chain SMT (Sparse Merkle Tree) updater for tracking stealth account leaves.
2. **`server`**: A Node.js backend acting as a relayer. It maintains the off-chain Poseidon Sparse Merkle Tree state, verifies proofs locally, and wraps transactions into UserOperations for the bundler.
3. **`zk`**: Circom circuits that generate Groth16 proofs. It allows users to prove knowledge of a secret spending key and ownership of a leaf in the current Merkle tree without revealing the sender's identity.
4. **`stealth-wallet`**: A React-based frontend providing a user-friendly UI for stealth meta-address generation, zk-proof construction, and secure private asset transfers.

## Key Mechanisms
- **Stealth Meta-Addresses**: Users generate one-time disposable stealth addresses computed deterministically using standard ECC operations. 
- **ZK-Proof Authorization**: Spending from a stealth account requires submitting a valid ZK proof of leaf inclusion and transaction validity, guaranteeing anonymity.
- **Rollback-Capable Indexing**: Ensures reliable synchronization between the relayer's tree and the blockchain's root, preventing loss of assets if an on-chain deployment fails.
