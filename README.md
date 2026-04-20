# 🕵️ Privacy-Preserving Stealth Wallet

A comprehensive stealth wallet system enabling **private cryptocurrency transfers** and **anonymous asset management** on EVM-compatible networks. The system leverages **Account Abstraction (ERC-4337)**, **Zero-Knowledge Proofs (zk-SNARKs / Groth16)**, and **Stealth Meta-Addresses** to completely break the on-chain link between sender and recipient.

> **Graduation Thesis Project (DATN-20252)** – Built on Ethereum Sepolia Testnet.

---

## 📐 System Architecture

The project is organized into **4 integrated sub-modules**:

```
DATN-20252/
├── blockchain/        # Hardhat – Smart contracts (Solidity 0.8.28)
├── server/            # Node.js – Off-chain relayer & Merkle tree manager
├── zk/                # Circom – Zero-knowledge proof circuits
└── stealth-wallet/    # React + Vite – Frontend DApp
```

### Component Overview

| Module | Tech | Role |
|---|---|---|
| `blockchain` | Hardhat, TypeScript, Viem | Smart contracts: StealthAccount, Factory, Paymaster, Social Recovery, ZK Verifier |
| `server` | Node.js, Express, snarkjs | Off-chain relayer: manages Poseidon Sparse Merkle Tree, generates proofs, submits UserOperations |
| `zk` | Circom, snarkjs | ZK circuits: proves leaf ownership and transaction validity without revealing identity |
| `stealth-wallet` | React 19, Vite, Ethers.js v6, Tailwind CSS v4 | Frontend DApp: stealth address generation, scanning, spending, ENS registration, social recovery |

---

## 🔑 Key Mechanisms

### 1. Stealth Meta-Addresses (ERC-5564)
- Each recipient publishes a **stealth meta-address** composed of two public keys: `scanPub` (for scanning) and `spendPub` (for spending).
- Senders derive a **one-time stealth address** deterministically using elliptic curve operations. The stealth address is never reused.
- An `ERC5564Announcer` contract emits encrypted announcement events so only the legitimate recipient can detect incoming funds.

### 2. Account Abstraction (ERC-4337)
- Each stealth address is backed by a **counterfactual smart account** (`StealthAccount.sol`) deployed only when needed.
- Transactions are submitted as **UserOperations** through a bundler to the `EntryPoint` contract.
- An **`OmniPaymaster`** sponsors gas fees, solving the "cold-start" problem where a brand-new stealth address holds no ETH for gas.

### 3. Zero-Knowledge Proof Authorization
- Spending from a stealth account requires a valid **Groth16 ZK proof** (generated from Circom circuits).
- The proof attests to: knowledge of the private spending key, and valid Merkle leaf inclusion in the current Sparse Merkle Tree (SMT) root.
- The on-chain `Groth16Verifier` contract validates the proof before executing the transaction.

### 4. Social Recovery with Index Commitment
- Users can designate **guardians** to recover access to their stealth accounts.
- Recovery is linked to the Merkle leaf index via a commitment hash (`indexHash`), preserving privacy.
- A `SocialRecovery.sol` contract orchestrates the multi-guardian approval flow.

### 5. ENS Integration
- Users can register a `.eth` name on **Sepolia ENS** and bind their stealth meta-address fields (`scanPub`, `spendPub`, `indexHash`) as resolver records.
- This makes stealth addresses human-readable and discoverable.

---

## 📦 Prerequisites

Make sure the following tools are installed globally:

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.x | https://nodejs.org |
| npm | ≥ 10.x | Included with Node.js |
| Git | Latest | https://git-scm.com |

You also need:
- An **Alchemy** (or Infura) API key for Sepolia RPC access.
- A **funded Sepolia wallet** (private key) for deploying contracts and signing transactions.
- An **Etherscan API key** for contract verification (optional).

---

## 🚀 Getting Started

### Step 1 – Clone the Repository

```bash
git clone https://github.com/AnNguyenVan123/StealthAddress.git
cd StealthAddress
```

---

## 🔷 Module 1: `blockchain` – Smart Contracts

### Setup

```bash
cd blockchain
npm install
```

### Configure Environment

Create a `.env` file in the `blockchain/` directory:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>
SEPOLIA_PRIVATE_KEY=<YOUR_WALLET_PRIVATE_KEY_WITHOUT_0x>
ETHERSCAN_API_KEY=<YOUR_ETHERSCAN_API_KEY>
```

> ⚠️ Never commit your `.env` file. It's already listed in `.gitignore`.

### Deploy Contracts to Sepolia

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

This deploys all core contracts in sequence:
1. `PoseidonHasher` – On-chain Poseidon hash library
2. `Groth16Verifier` – ZK proof verifier
3. `SMTVerifier` – Sparse Merkle Tree root verifier
4. `StealthAccountFactory` – Factory for counterfactual stealth accounts
5. `ERC5564Announcer` – Announcement event emitter
6. `OmniPaymaster` – Gas sponsorship paymaster

After deployment, note the printed contract addresses – you'll need them in the `server` and `stealth-wallet` configs.

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

---

## 🔶 Module 2: `server` – Off-chain Relayer

The server maintains the **off-chain Poseidon Sparse Merkle Tree**, generates ZK proofs when needed, and submits ERC-4337 `UserOperation`s to the bundler on behalf of users.

### Setup

```bash
cd server
npm install
```

### Configure Environment

Create a `.env` file in the `server/` directory:

```env
# Server port
PORT=3000

# Sepolia RPC endpoint
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>

# Private key of the deployer/owner wallet
PRIVATE_KEY=<YOUR_WALLET_PRIVATE_KEY_WITHOUT_0x>

# Deployed contract addresses (from blockchain deploy step)
CONTRACT_ADDRESS=<STEALTH_ACCOUNT_FACTORY_ADDRESS>
VERIFIER_ADDRESS=<GROTH16_VERIFIER_ADDRESS>
POSEIDON_ADDRESS=<POSEIDON_HASHER_ADDRESS>
SMT_VERIFIER_ADDRESS=<SMT_VERIFIER_ADDRESS>
PAYMASTER_ADDRESS=<OMNI_PAYMASTER_ADDRESS>
```

### Run the Server

```bash
npm start
```

Expected output:
```
[🚀] Stealth Server running on port 3000
[🌳] Poseidon Tree Root: 0x...
```

### Available API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/tree` | Get current Merkle tree root |
| `GET` | `/proof/:leaf` | Generate Merkle proof for a leaf |
| `GET` | `/debug/visualize-tree` | Visualize the full Merkle tree |
| `POST` | `/leaves` | Publish a new stealth leaf (register account) |
| `POST` | `/api/spend-zk-proof` | Submit a spend request with ZK proof |

---

## 🟣 Module 3: `zk` – Zero-Knowledge Circuits

The ZK circuits are written in **Circom** and compiled to Groth16 proofs using **snarkjs**.

### Circuit Files

| Circuit | Location | Purpose |
|---|---|---|
| Stealth Spend | `zk/circuits/stealth_spend/` | Proves spending key ownership + Merkle inclusion |
| SMT Update | `zk/circuits/smt/` | Proves valid Sparse Merkle Tree leaf update |

### Setup

```bash
cd zk/circuits
npm install
```

### Compile a Circuit (example: stealth_spend)

> **Note:** You need `circom` installed. Install via:  
> `npm install -g circom` or follow https://docs.circom.io/getting-started/installation/

```bash
# Inside zk/circuits/stealth_spend/
circom stealth_spend.circom --r1cs --wasm --sym -o ./build
```

### Generate Proving Keys (Groth16 trusted setup)

```bash
# Download Powers of Tau (phase 1)
snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="Contributor" -v
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v

# Phase 2 - circuit-specific setup
snarkjs groth16 setup stealth_spend.r1cs pot12_final.ptau stealth_spend_0000.zkey
snarkjs zkey contribute stealth_spend_0000.zkey stealth_spend_0001.zkey --name="Contributor" -v
snarkjs zkey export verificationkey stealth_spend_0001.zkey verification_key.json
```

### Export Solidity Verifier

```bash
snarkjs zkey export solidityverifier stealth_spend_0001.zkey Groth16Verifier.sol
```

> The pre-compiled `.wasm`, `.zkey`, and `verification_key.json` files used by the server are stored in `server/zk/`.

---

## 🟢 Module 4: `stealth-wallet` – Frontend DApp

A **React 19 + Vite** DApp providing the full user interface for all stealth wallet operations.

### Setup

```bash
cd stealth-wallet
npm install
```

### Configure Environment

Create a `.env` file in the `stealth-wallet/` directory:

```env
# Deployed contract addresses
VITE_FACTORY_ADDRESS=<STEALTH_ACCOUNT_FACTORY_ADDRESS>
VITE_ANNOUNCER_ADDRESS=<ERC5564_ANNOUNCER_ADDRESS>
VITE_PAYMASTER_ADDRESS=<OMNI_PAYMASTER_ADDRESS>

# RPC endpoint
VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>

# Local relayer server URL
VITE_SERVER_URL=http://localhost:3000
```

### Run Development Server

```bash
npm run dev
```

The app will be available at: **http://localhost:5173**

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` folder.

### Application Features

| Screen | Description |
|---|---|
| **Wallet** | View stealth meta-address, manage connected accounts, scan for incoming stealth payments |
| **Send** | Send ETH/tokens privately to any stealth meta-address |
| **Assets** | View total balance across all discovered stealth accounts |
| **ENS Register** | Register a `.eth` domain on Sepolia ENS and bind stealth keys to resolver |
| **Recovery** | Configure social recovery guardians and manage recovery requests |

---

## ⚡ Full System Startup (Recommended Order)

Run each step in a separate terminal:

```bash
# Terminal 1 – Start the relayer server
cd server
npm start

# Terminal 2 – Start the frontend DApp
cd stealth-wallet
npm run dev
```

Then open **http://localhost:5173** in your browser and connect MetaMask to the **Sepolia** testnet.

---

## 🗺️ System Flow Diagram

```
Sender                    Frontend (DApp)              Relayer (Server)          Blockchain (Sepolia)
  │                           │                              │                          │
  │── Enter recipient ENS ──► │                              │                          │
  │                           │── Resolve stealth keys ─────────────────────────────►  │
  │                           │◄─ scanPub, spendPub ───────────────────────────────── │
  │                           │                              │                          │
  │                           │── Derive stealth address ──► (local ECC computation)    │
  │                           │── Request leaf publish ──►  │                          │
  │                           │                             │── Publish leaf ─────────► │
  │                           │◄─ leafIndex, Merkle root ── │                          │
  │                           │                              │                          │
  │                           │── Send ETH (UserOp) ───────────────────────────────►  │
  │                           │                              │  Paymaster sponsors gas  │
  │                           │                              │                          │
Recipient                     │                              │                          │
  │── Scan announcements ────► │                              │                          │
  │                           │── Query announcer logs ─────────────────────────────►  │
  │                           │◄─ Encrypted announcements ─────────────────────────── │
  │                           │── Decrypt with scanKey ──►  (local computation)         │
  │                           │                              │                          │
  │── Spend funds ──────────► │── Generate ZK proof ────────────────────────────────►  │
  │                           │                             │── Verify proof ─────────► │
  │                           │◄─ Tx confirmed ─────────────────────────────────────── │
```

---

## 🧩 Smart Contract Addresses (Sepolia Testnet)

| Contract | Address |
|---|---|
| StealthAccountFactory | `0xb98c99ed8e324338567ef48782338a3742ad6800` |
| ERC5564Announcer | `0x37734fddf3d4953894141fcaa35e1c6197a0783b` |
| OmniPaymaster | `0x56022bc69a7cb5dfcbc96116dc6c57fa33affaf3` |
| Groth16Verifier | `0x3d355b6da1c866b1807f2c4122b7e104bca5c1e7` |
| SMTVerifier | `0xe686516193bb2600bb8268f4a95179d7ff67139c` |
| PoseidonHasher | `0xd2a95e1105682f96bfcdbcdcc04a2d24ad23f5e8` |
| MerkleTreeManager | `0x0b9852c2c9a0e59b8f67eb5ebc377717f2756a19` |

---

## 🔒 Security Notes

- **Never share your private key.** Use a dedicated test wallet for development.
- The `.env` files are excluded from version control via `.gitignore`.
- ZK proofs ensure that spending transactions cannot be linked back to the stealth address owner.
- The Merkle tree root is stored on-chain; all leaf updates are verified by the `SMTVerifier` contract.

---

## 📄 License

This project is developed as a **graduation thesis** and is intended for educational and research purposes.

---

## 👤 Author

**An Nguyen Van** – [@AnNguyenVan123](https://github.com/AnNguyenVan123)
