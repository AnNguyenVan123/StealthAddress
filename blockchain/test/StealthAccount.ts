import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("StealthAccount + StealthAccountFactory", function () {

    async function deploy() {
        const [deployer, alice, bob] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("StealthAccountFactory");
        const factory = await Factory.deploy();

        return { factory, deployer, alice, bob };
    }

    // ─── Factory: deployFor ───────────────────────────────────────────────────

    it("deployFor: deploys a StealthAccount at the expected address", async function () {
        const { factory, alice } = await deploy();

        const stealthEOA = alice.address;

        // Pre-compute the counterfactual address
        const expected = await factory.getAddress(stealthEOA);

        // Deploy
        const tx = await factory.deployFor(stealthEOA);
        await tx.wait();

        // Code should now exist at that address
        const code = await ethers.provider.getCode(expected);
        expect(code.length).to.be.greaterThan(2);
    });

    it("deployFor: is idempotent (second call returns existing contract, no revert)", async function () {
        const { factory, alice } = await deploy();

        const stealthEOA = alice.address;

        await (await factory.deployFor(stealthEOA)).wait();

        // Should NOT revert on second call
        const tx2 = await factory.deployFor(stealthEOA);
        await tx2.wait();
    });

    it("getAddress: returns same address before and after deployment", async function () {
        const { factory, bob } = await deploy();

        const stealthEOA = bob.address;

        const before = await factory.getAddress(stealthEOA);
        await (await factory.deployFor(stealthEOA)).wait();
        const after = await factory.getAddress(stealthEOA);

        expect(before).to.equal(after);
    });

    it("deployFor: emits StealthAccountDeployed event", async function () {
        const { factory, alice } = await deploy();

        const stealthEOA = alice.address;
        const expectedAddr = await factory.getAddress(stealthEOA);

        await expect(factory.deployFor(stealthEOA))
            .to.emit(factory, "StealthAccountDeployed")
            .withArgs(stealthEOA, expectedAddr);
    });

    // ─── StealthAccount: owner ───────────────────────────────────────────────

    it("StealthAccount: owner is set to stealthEOA", async function () {
        const { factory, alice } = await deploy();

        const stealthEOA = alice.address;
        const contractAddr = await factory.getAddress(stealthEOA);

        await (await factory.deployFor(stealthEOA)).wait();

        const StealthAccount = await ethers.getContractAt("StealthAccount", contractAddr);
        expect(await StealthAccount.owner()).to.equal(stealthEOA);
    });

    // ─── StealthAccount: receive ETH ─────────────────────────────────────────

    it("StealthAccount: accepts ETH deposits", async function () {
        const { factory, deployer, alice } = await deploy();

        const stealthEOA = alice.address;
        const contractAddr = await factory.getAddress(stealthEOA);

        await (await factory.deployFor(stealthEOA)).wait();

        // Send 0.1 ETH to the account
        await deployer.sendTransaction({
            to: contractAddr,
            value: ethers.parseEther("0.1"),
        });

        const balance = await ethers.provider.getBalance(contractAddr);
        expect(balance).to.equal(ethers.parseEther("0.1"));
    });

    // ─── StealthAccount: execute ─────────────────────────────────────────────

    it("execute: owner can transfer ETH out", async function () {
        const { factory, deployer, alice, bob } = await deploy();

        const stealthEOA = alice.address;
        const contractAddr = await factory.getAddress(stealthEOA);

        await (await factory.deployFor(stealthEOA)).wait();

        // Fund the account
        await deployer.sendTransaction({
            to: contractAddr,
            value: ethers.parseEther("0.5"),
        });

        const StealthAccount = await ethers.getContractAt("StealthAccount", contractAddr);

        const bobBefore = await ethers.provider.getBalance(bob.address);

        // alice (owner) calls execute to send ETH to bob
        await StealthAccount.connect(alice).execute(
            bob.address,
            ethers.parseEther("0.3"),
            "0x"
        );

        const bobAfter = await ethers.provider.getBalance(bob.address);
        expect(bobAfter - bobBefore).to.equal(ethers.parseEther("0.3"));
    });

    it("execute: non-owner is rejected", async function () {
        const { factory, deployer, alice, bob } = await deploy();

        const stealthEOA = alice.address;
        const contractAddr = await factory.getAddress(stealthEOA);

        await (await factory.deployFor(stealthEOA)).wait();

        await deployer.sendTransaction({
            to: contractAddr,
            value: ethers.parseEther("0.1"),
        });

        const StealthAccount = await ethers.getContractAt("StealthAccount", contractAddr);

        await expect(
            StealthAccount.connect(bob).execute(
                bob.address,
                ethers.parseEther("0.05"),
                "0x"
            )
        ).to.be.revertedWithCustomError(StealthAccount, "NotOwner");
    });
});
