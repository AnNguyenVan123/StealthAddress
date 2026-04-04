import { describe, it, before } from "node:test";
import assert from "node:assert";
import { network } from "hardhat";

describe("Groth16Verifier", function () {
    let verifier;
    let viem;

    before(async function () {
        const connection = await network.connect();
        viem = connection.viem;

        verifier = await viem.deployContract("Groth16Verifier");
        console.log("Verifier deployed to:", verifier.address);
    });

    it("Should verify a valid proof correctly", async function () {
        // Hardcoded directly from your `snarkjs generatecall` output
        const pA = ["0x2491f0033e94af5eb9558bff98ee158032c5d8f055cf0776baad8142257963a2", "0x2d767c3eb5bb4bb33fc020b74dbf0a0be02e215ba93ea4cdf0c02b352880128d"];
        const pB = [
            ["0x1fad7d43306eb1dc834442bd8413d5dc4decc653fcf7126e42985fb3ade5d22c", "0x1cf81484636f92c33646f41ba616b0c01060b6c7f3124e6a547a9b09302fffec"],
            ["0x2cf14b32ab2ac68bf85cacd91e5fd91a36288a57c62c589c50421b43e770b56b", "0x29dec8129325d7cf06fa7f88ce2cd1326a2da5da162bd38e0bc891cc007b1398"]
        ];
        const pC = ["0x1ff91857a72802434c88c8da107413b2f120499090cb91dcb56fb111676e7e67", "0x11cc1d5333c5858d32b65473d4f510bd8b9067fba69956261abc5752edc7794f"];
        const pubSignals = ["0x238069edc781f008672d2d2f96fe50e0e7fa272d237a87f96b4725458b425e1a", "0x2536d01521137bf7b39e3fd26c1376f456ce46a45993a5d7c3c158a450fd7329"];

        const isValid = await verifier.read.verifyProof([pA, pB, pC, pubSignals]);

        assert.strictEqual(isValid, true);
    });

    it("Should return false for an invalid proof (tampered data)", async function () {
        const pA = ["0x2491f0033e94af5eb9558bff98ee158032c5d8f055cf0776baad8142257963a2", "0x2d767c3eb5bb4bb33fc020b74dbf0a0be02e215ba93ea4cdf0c02b352880128d"];
        const pB = [
            ["0x1fad7d43306eb1dc834442bd8413d5dc4decc653fcf7126e42985fb3ade5d22c", "0x1cf81484636f92c33646f41ba616b0c01060b6c7f3124e6a547a9b09302fffec"],
            ["0x2cf14b32ab2ac68bf85cacd91e5fd91a36288a57c62c589c50421b43e770b56b", "0x29dec8129325d7cf06fa7f88ce2cd1326a2da5da162bd38e0bc891cc007b1398"]
        ];
        const pC = ["0x1ff91857a72802434c88c8da107413b2f120499090cb91dcb56fb111676e7e67", "0x11cc1d5333c5858d32b65473d4f510bd8b9067fba69956261abc5752edc7794f"];
        const pubSignals = ["0x238069edc781f008672d2d2f96fe50e0e7fa272d237a87f96b4725458b425e1a", "0x2536d01521137bf7b39e3fd26c1376f456ce46a45993a5d7c3c158a450fd7329"];

        // Deliberately tamper with the first public signal
        const tamperedPubSignals = [...pubSignals];
        tamperedPubSignals[0] = "0x0000000000000000000000000000000000000000000000000000000000000001";

        const isValid = await verifier.read.verifyProof([pA, pB, pC, tamperedPubSignals]);

        assert.strictEqual(isValid, false);
    });
});