import hre from "hardhat";
import { buildPoseidon } from "circomlibjs";
import { poseidonContract } from "circomlibjs";
import { updateProjectEnvs } from "./utils/env-updater.js";

// ─── Helper: compute Poseidon empty-tree root (zeroHashes[depth]) ─────────────
async function computePoseidonEmptyRoot(depth: number): Promise<`0x${string}`> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  let zero: bigint = 0n;
  for (let i = 0; i < depth; i++) {
    const h = poseidon([zero, zero]);
    zero = F.toObject(h);
  }
  return `0x${zero.toString(16).padStart(64, "0")}` as `0x${string}`;
}

async function main() {
  // 1. Establish the network connection explicitly (Hardhat 3 requirement)
  const connection = await hre.network.connect();

  console.log(`Deploying to network: ${connection.networkName}`);

  // 2. viem clients are accessed through the connection object
  const publicClient = await connection.viem.getPublicClient();
  const walletClients = await connection.viem.getWalletClients();
  const walletClient = walletClients[0];

  const account = walletClient.account;
  console.log(`Deploying with account: ${account.address}`);

  // =========================
  // 1. Deploy Poseidon
  // =========================
  console.log("Deploying Poseidon2...");

  const poseidonABI = poseidonContract.generateABI(2);
  const poseidonBytecode = poseidonContract.createCode(2);

  const poseidonHash = await walletClient.deployContract({
    abi: poseidonABI,
    bytecode: poseidonBytecode as `0x${string}`,
    account,
  });

  const poseidonReceipt = await publicClient.waitForTransactionReceipt({
    hash: poseidonHash,
  });

  const poseidonAddress = poseidonReceipt.contractAddress!;
  console.log(`Poseidon deployed at: ${poseidonAddress}`);

  // =========================
  // 2. Deploy SMTUpdateVerifier (for tree root updates)
  // =========================
  console.log("Deploying SMTUpdateVerifier...");

  const smtVerifierArtifact = await hre.artifacts.readArtifact("SMTUpdateVerifier");

  const smtVerifierHash = await walletClient.deployContract({
    abi: smtVerifierArtifact.abi,
    bytecode: smtVerifierArtifact.bytecode as `0x${string}`,
    account,
  });

  const smtVerifierReceipt = await publicClient.waitForTransactionReceipt({
    hash: smtVerifierHash,
  });

  const smtVerifierAddress = smtVerifierReceipt.contractAddress!;
  console.log(`SMTUpdateVerifier deployed at: ${smtVerifierAddress}`);

  // =========================
  // 3. Deploy IncrementalMerkleTree (wired to SMTUpdateVerifier)
  // =========================
  console.log("Deploying IncrementalMerkleTree...");

  const imtArtifact = await hre.artifacts.readArtifact("IncrementalMerkleTree");

  const imtHash = await walletClient.deployContract({
    abi: imtArtifact.abi,
    bytecode: imtArtifact.bytecode as `0x${string}`,
    args: [smtVerifierAddress],
    account,
  });

  const imtReceipt = await publicClient.waitForTransactionReceipt({
    hash: imtHash,
  });

  const imtAddress = imtReceipt.contractAddress!;
  console.log(`IncrementalMerkleTree deployed at: ${imtAddress}`);

  // =========================
  // 3b. Initialize the on-chain root to match the server's Poseidon empty-tree root
  //
  //  WHY: The contract starts with root = bytes32(0).  The server's
  //  PoseidonSparseMerkleTree computes zeroHashes[20] as the empty root,
  //  which is non-zero.  Every updateRoot() ZK proof uses the current on-chain
  //  root as publicSignals[0] (oldRoot).  If on-chain root = 0 but the proof
  //  was generated with oldRoot = zeroHashes[20], verification fails.
  //  We call initRoot() once here to align both sides before any leaf is added.
  // =========================
  console.log("Computing Poseidon empty-tree root (depth=20)...");
  const emptyTreeRoot = await computePoseidonEmptyRoot(20);
  console.log(`Empty tree root: ${emptyTreeRoot}`);

  console.log("Initialising on-chain root...");
  const initRootTxHash = await walletClient.writeContract({
    address: imtAddress,
    abi: imtArtifact.abi,
    functionName: "initRoot",
    args: [emptyTreeRoot],
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash: initRootTxHash });
  console.log(`IncrementalMerkleTree root initialised to: ${emptyTreeRoot}`);

  // =========================
  // 4. Deploy Verifier (for stealth spend proofs)
  // =========================
  console.log("Deploying StealthSpendVerifier (stealth spend)...");

  const verifierArtifact = await hre.artifacts.readArtifact("StealthSpendVerifier");

  const verifierHash = await walletClient.deployContract({
    abi: verifierArtifact.abi,
    bytecode: verifierArtifact.bytecode as `0x${string}`,
    account,
  });

  const verifierReceipt = await publicClient.waitForTransactionReceipt({
    hash: verifierHash,
  });

  const verifierAddress = verifierReceipt.contractAddress!;
  console.log(`StealthSpendVerifier (spend) deployed at: ${verifierAddress}`);

  // =========================
  // 5. Deploy StealthAccountFactory
  // =========================
  console.log("Deploying StealthAccountFactory...");

  const factoryArtifact = await hre.artifacts.readArtifact(
    "StealthAccountFactory"
  );

  const factoryHash = await walletClient.deployContract({
    abi: factoryArtifact.abi,
    bytecode: factoryArtifact.bytecode as `0x${string}`,
    args: [imtAddress, poseidonAddress, verifierAddress],
    account,
  });

  const factoryReceipt = await publicClient.waitForTransactionReceipt({
    hash: factoryHash,
  });

  const stealthFactoryAddress = factoryReceipt.contractAddress!;

  console.log(`StealthAccountFactory deployed at: ${stealthFactoryAddress}`);

  // =========================
  // 6. Deploy ERC5564Announcer
  // =========================
  console.log("Deploying ERC5564Announcer...");

  const announcerArtifact = await hre.artifacts.readArtifact("ERC5564Announcer");

  const announcerHash = await walletClient.deployContract({
    abi: announcerArtifact.abi,
    bytecode: announcerArtifact.bytecode as `0x${string}`,
    account,
  });

  const announcerReceipt = await publicClient.waitForTransactionReceipt({
    hash: announcerHash,
  });

  const announcerAddress = announcerReceipt.contractAddress!;
  console.log(`ERC5564Announcer deployed at: ${announcerAddress}`);

  // =========================
  // 7. Deploy OmniPaymaster
  // =========================
  console.log("Deploying OmniPaymaster...");
  const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // Standard EntryPoint v0.6
  
  const paymasterArtifact = await hre.artifacts.readArtifact("OmniPaymaster");

  const paymasterHash = await walletClient.deployContract({
    abi: paymasterArtifact.abi,
    bytecode: paymasterArtifact.bytecode as `0x${string}`,
    args: [entryPointAddress],
    account,
  });

  const paymasterReceipt = await publicClient.waitForTransactionReceipt({
    hash: paymasterHash,
  });

  const paymasterAddress = paymasterReceipt.contractAddress!;
  console.log(`OmniPaymaster deployed at: ${paymasterAddress}`);

  // Also deposit some ETH into the paymaster to sponsor transactions
  try {
      const depositHash = await walletClient.writeContract({
        address: paymasterAddress,
        abi: paymasterArtifact.abi,
        functionName: "deposit",
        value: 5000000000000000000n, // 5 ETH
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });
      console.log("Deposited 5 ETH to paymaster");
  } catch (e) {
      console.log("Failed to deposit to paymaster:", e);
  }

  // =========================
  // DONE
  // =========================
  console.log("\n=================================");
  console.log(`Network: ${connection.networkName}`);
  console.log(`POSEIDON_ADDRESS=${poseidonAddress}`);
  console.log(`TREE_MANAGER_ADDRESS=${imtAddress}`);
  console.log(`TREE_INITIAL_ROOT=${emptyTreeRoot}`);
  console.log(`STEALTH_FACTORY_ADDRESS=${stealthFactoryAddress}`);
  console.log(`ANNOUNCER_ADDRESS=${announcerAddress}`);
  console.log(`VERIFIER_ADDRESS=${verifierAddress}`);
  console.log(`SMT_VERIFIER_ADDRESS=${smtVerifierAddress}`);
  console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
  console.log("=================================\n");


  // AUTOMATIC .env UPDATER
  updateProjectEnvs({
    poseidon: poseidonAddress,
    treeManager: imtAddress,
    stealthFactory: stealthFactoryAddress,
    announcer: announcerAddress,
    verifier: verifierAddress,
    smtVerifier: smtVerifierAddress,
    paymaster: paymasterAddress,
  });
}

// This is the part that was likely missing!
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});