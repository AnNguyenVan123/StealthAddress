import { Router } from 'express';
import { ethers } from 'ethers';
import { signer, provider, ENTRY_POINT } from '../config/index.js';
import { stealthABI, factoryABI, entryPointABI } from '../abis/index.js';
import { generateSpendProof, encodeProofSignature } from '../services/zkService.js';
import { decodeHexToAscii } from '../utils/helpers.js';

const router = Router();

/**
 * POST /api/spend-zk-proof
 *
 * End-to-end stealth transfer flow:
 *   1. Generate a Groth16 ZK proof for the sender's leaf.
 *   2. Verify the sender wallet has sufficient balance.
 *   3. Build calldata for executeStealthTransfer().
 *   4. Encode the proof as UserOperation signature.
 *   5. Submit via ERC-4337 handleOps.
 *
 * Body:
 *   senderStealthAddress, recipientIndexCommitment, recipientAbstractAccount,
 *   valueString, senderIndexCommitment, senderSharedSecretHash, factoryAddress, announcerAddress,
 *   schemeId, ephemeralPub, metadata
 */
router.post('/', async (req, res) => {
    const {
        senderStealthAddress,
        recipientIndexCommitment,
        recipientAbstractAccount,
        valueString,
        senderIndexCommitment,
        senderSharedSecretHash,
        spendPriv,           // sender's spending private key (private ZK circuit input x)
        factoryAddress,
        announcerAddress,
        schemeId,
        ephemeralPub,
        metadata,
    } = req.body;

    // ── 1. Validate input ────────────────────────────────────────────────────
    if (
        !senderStealthAddress ||
        !recipientIndexCommitment ||
        !recipientAbstractAccount ||
        !valueString ||
        !senderIndexCommitment ||
        !senderSharedSecretHash ||
        !spendPriv ||
        !factoryAddress ||
        !announcerAddress
    ) {
        return res.status(400).json({
            error: 'Missing required fields: senderStealthAddress, recipientIndexCommitment, recipientAbstractAccount, valueString, senderIndexCommitment, senderSharedSecretHash, spendPriv, factoryAddress, announcerAddress',
        });
    }

    if (!signer) {
        return res.status(500).json({ error: 'Server missing PRIVATE_KEY' });
    }

    // ── 2. Generate ZK proof ─────────────────────────────────────────────────
    let auth;
    let indexCommitment;
    try {
        console.log('[Step 1] Generating ZK proof…');
        ({ auth, indexCommitment } = await generateSpendProof(
            senderIndexCommitment,
            spendPriv,
            senderSharedSecretHash
        ));
    } catch (err) {
        console.error('[❌] ZK proof generation failed:', err);
        return res.status(500).json({ error: 'Failed to generate ZK proof: ' + err.message });
    }

    try {
        const factory = new ethers.Contract(factoryAddress, factoryABI, signer);
        const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointABI, signer);

        // ── 3. Balance check ────────────────────────────────────────────────
        const transferValue = BigInt(valueString);
        const aaBalance = await provider.getBalance(senderStealthAddress);

        if (aaBalance < transferValue) {
            return res.status(400).json({
                error: 'INSUFFICIENT_BALANCE',
                have: ethers.formatEther(aaBalance),
                need: ethers.formatEther(transferValue),
            });
        }

        // ── 4. Build calldata ────────────────────────────────────────────────
        let callData;
        try {
            console.log('[Step 2] Building calldata…');
            const stealthInterface = new ethers.Interface(stealthABI);
            callData = stealthInterface.encodeFunctionData('executeStealthTransfer', [
                announcerAddress,
                schemeId,
                recipientAbstractAccount,
                valueString,
                ephemeralPub,
                metadata,
                { a: auth.a, b: auth.b, c: auth.c },
            ]);
        } catch (err) {
            throw new Error('CALLDATA_BUILD_FAILED: ' + err.message);
        }

        // ── 5. Encode signature ──────────────────────────────────────────────
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const signature = encodeProofSignature(auth, senderIndexCommitment, abiCoder);

        // Sanity-check: decode locally before sending
        try {
            abiCoder.decode(
                ['tuple(uint256[2],uint256[2][2],uint256[2])', 'uint256'],
                signature,
            );
            console.log('[✅] Local ABI decode of signature OK');
        } catch (e) {
            console.error('[❌] Local ABI decode FAILED:', e);
        }

        // ── 6. Get nonce & gas ───────────────────────────────────────────────
        let initCode = '0x';
        const codeAtAddress = await provider.getCode(senderStealthAddress);
        if (codeAtAddress === '0x') {
            const factoryInterface = new ethers.Interface(factoryABI);
            // Ensure indexCommitment is bytes32 by converting to BigInt then to hex representation
            const indexHex = '0x' + BigInt(senderIndexCommitment).toString(16).padStart(64, '0');
            const deployCallData = factoryInterface.encodeFunctionData('deployFor', [indexHex]);
            initCode = ethers.concat([factoryAddress, deployCallData]);
            console.log('[Step 2b] Sender AA not deployed. Added initCode.');
        }

        const nonce = await entryPoint.getNonce(senderStealthAddress, 0);
        const feeData = await provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('20', 'gwei');
        const maxPriorityFeePerGas =
            feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei');

        // ── 7. Build UserOperation ───────────────────────────────────────────
        const userOp = {
            sender: senderStealthAddress,
            nonce: nonce.toString(),
            initCode: initCode,
            callData,
            callGasLimit: 500_000,
            verificationGasLimit: 2_000_000,
            preVerificationGas: 100_000,
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
            paymasterAndData: '0x',
            signature,
        };

        console.log('[UserOp]', JSON.stringify(userOp, null, 2));

        // ── 8. On-chain debug (optional) ─────────────────────────────────────
        try {
            const codeAtAddress = await provider.getCode(senderStealthAddress);
            if (codeAtAddress === '0x') {
                console.error('[❌] No contract at sender address!');
            } else {
                const stealthAcc = new ethers.Contract(senderStealthAddress, stealthABI, signer);
                const result = await stealthAcc.debugVerifyProof.staticCall(signature);
                const [ok, reason, rootSig, indexSig] = result;
                console.log('[DEBUG]', { ok, reason, rootSig: rootSig.toString(), indexSig: indexSig.toString() });

                if (!ok) {
                    return res.status(400).json({
                        error: reason,
                        root: rootSig.toString(),
                        index: indexSig.toString(),
                    });
                }
                console.log('[✅] debugVerifyProof OK');
            }
        } catch (err) {
            console.warn('[⚠️] Debug verification skipped:', err.message);
        }

        // ── 9. Submit UserOperation ─────────────────────────────────────────
        let tx;
        try {
            console.log('[Step 3] Sending handleOps…');
            tx = await entryPoint.handleOps([userOp], await signer.getAddress());
        } catch (err) {
            throw new Error('HANDLE_OPS_FAILED: ' + err.message);
        }

        const receipt = await tx.wait();
        console.log('[✅] Tx hash:', receipt.hash);
        console.log('[✅] Log count:', receipt.logs.length);

        // Decode any string-like event data for debugging
        for (const log of receipt.logs) {
            try {
                const decoded = decodeHexToAscii(log.data);
                if (decoded.length > 0) {
                    console.log(`[Log ${log.index}] "${decoded}"`);
                } else {
                    console.log(`[Log ${log.index}] raw: ${log.data}`);
                }
            } catch (e) {
                console.error('[❌] Error decoding log:', e);
            }
        }

        return res.json({ success: true, txHash: receipt.hash });
    } catch (err) {
        console.error('[❌] Bundler error:', err);
        return res.status(500).json({
            error: 'BUNDLER_FAILED',
            detail: err.message,
        });
    }
});

export default router;
