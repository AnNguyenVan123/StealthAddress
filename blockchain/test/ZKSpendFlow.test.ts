import { describe, it, before } from "node:test";
import assert from "node:assert";
import { network, ethers } from "hardhat";
import path from "path";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

describe("Verify and Spend Flow", function () {
    let verifier, factory, treeManager;
    let indexCommitment, root, merkleProof, pathIndices;
    let stealthEOA;
    let contractAddr;
    let alice, bob;

    before(async function () {
        const signers = await ethers.getSigners();
        alice = signers[0];
        bob = signers[1];

        // 1. Deploy Verifier
        const Verifier = await ethers.getContractFactory("Groth16Verifier");
        verifier = await Verifier.deploy();
        await verifier.waitForDeployment();

        // 2. Deploy Tree Manager (IncrementalMerkleTree)
        const IMT = await ethers.getContractFactory("IncrementalMerkleTree");
        treeManager = await IMT.deploy();
        await treeManager.waitForDeployment();

        // 3. Deploy Factory
        const Factory = await ethers.getContractFactory("StealthAccountFactory");
        factory = await Factory.deploy(
            await treeManager.getAddress(),
            ethers.ZeroAddress, // Mock Poseidon because spend doesn't use it
            await verifier.getAddress()
        );
        await factory.waitForDeployment();

        // 4. Generate inputs and root
        const poseidon = await buildPoseidon();
        const F = poseidon.F;

        // Leaf / Index Commitment
        const leafValue = poseidon([123456789, 987654321]);
        indexCommitment = F.toString(leafValue);
        
        merkleProof = [];
        pathIndices = 0; // Left most node

        let currentHash = leafValue;
        for (let i = 0; i < 20; i++) {
            const sibling = poseidon([1, i]); // Deterministic sibling for test
            merkleProof.push(F.toString(sibling));
            currentHash = poseidon([currentHash, sibling]);
        }
        root = F.toString(currentHash);

        // Update Tree Manager with new root
        const mockAuth = {
            a: [0, 0],
            b: [[0, 0], [0, 0]],
            c: [0, 0]
        };
        await treeManager.updateRoot(
            ethers.toBeHex(BigInt(root), 32),
            ethers.toBeHex(BigInt(indexCommitment), 32),
            mockAuth
        );
        
        // 5. Deploy Stealth Account via Factory
        const bytes32IndexCommitment = ethers.toBeHex(BigInt(indexCommitment), 32);
        await factory.deployFor(bytes32IndexCommitment);
        contractAddr = await factory.getAddress(bytes32IndexCommitment);

        // Fund the Stealth Account
        await alice.sendTransaction({
            to: contractAddr,
            value: ethers.parseEther("1.0")
        });
    });

    it("Should generate a valid proof and spend ETH", async function () {
        const StealthAccount = await ethers.getContractAt("StealthAccount", contractAddr);
        
        // 1. Generate zk-proof locally
        const inputData = {
             root: root,
             indexCommitment: indexCommitment,
             merkleProof: merkleProof,
             pathIndices: pathIndices
        };
        
        console.log("Generating proof...");
        const wasmPath = path.join(process.cwd(), "stealth_js/stealth.wasm");
        const zkeyPath = path.join(process.cwd(), "circuit_final.zkey");
        
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputData,
            wasmPath,
            zkeyPath
        );

        console.log("Proof generated!");
        console.log("Public Signals length:", publicSignals.length);

        // Format proof for Solidity
        const zkpAuth = {
            a: [proof.pi_a[0], proof.pi_a[1]],
            b: [
                [proof.pi_b[0][1], proof.pi_b[0][0]],
                [proof.pi_b[1][1], proof.pi_b[1][0]]
            ],
            c: [proof.pi_c[0], proof.pi_c[1]]
        };

        const bobBalanceBefore = await ethers.provider.getBalance(bob.address);
        const sendAmount = ethers.parseEther("0.5");

        console.log("Executing spend transaction using execute...");
        // Call execute
        // `execute(address to, uint256 value, bytes calldata data, ZKPAuth calldata auth)`
        const tx = await StealthAccount.execute(
            bob.address,
            sendAmount,
            "0x",
            zkpAuth
        );
        await tx.wait();

        const bobBalanceAfter = await ethers.provider.getBalance(bob.address);
        assert.strictEqual(
            bobBalanceAfter - bobBalanceBefore, 
            sendAmount, 
            "Bob balance should increase by 0.5 ETH"
        );
        console.log("Spend verified and executed successfully!");
    });
});
