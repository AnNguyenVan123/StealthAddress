import { useState } from "react";
import { ethers } from "ethers";
import { createMetaAddress } from "../stealth/crypto";
import { scanStealthPayments } from "../scanner/scannerEngine";
import { executeStealthTransfer } from "../services/stealthService";
import { publishAccountLeaf, lookupLeaf, computeIndexHash, getPoseidon } from "../stealth/zkIntegration";

/**
 * useStealthWallet
 *
 * Manages all stealth wallet state and business logic.
 * Components should consume this hook and render only based on the returned state.
 */
export function useStealthWallet(meta, setMeta) {
    const [isScanning, setIsScanning] = useState(false);
    const [sendingIndex, setSendingIndex] = useState(null);
    const [sendProgress, setSendProgress] = useState("");
    const [scanPriv, setScanPriv] = useState("");
    const [spendPriv, setSpendPriv] = useState("");
    const [stealthWallets, setStealthWallets] = useState([]);

    /** Creates a fresh stealth meta-address key pair and publishes its account leaf. */
    async function createWallet() {
        const wallet = createMetaAddress();
        const { index } = await publishAccountLeaf(
            wallet.spendPriv,
            wallet.spendPub
        );
        console.log("Spend private:", wallet.spendPriv);
        console.log("Scan private:", wallet.scanPriv);
        const indexHash = await computeIndexHash(index);
        const full = { ...wallet, index, indexHash };
        setMeta(full);
        return full;
    }

    /** Imports an existing wallet from scan + spend private keys. */
    async function importWallet() {
        if (!scanPriv || !spendPriv) throw new Error("Please enter both Private Keys");
        const scanKey = new ethers.SigningKey(scanPriv);
        const spendKey = new ethers.SigningKey(spendPriv);
        const wallet = {
            scanPriv,
            spendPriv,
            scanPub: scanKey.publicKey,
            spendPub: spendKey.publicKey,
        };

        // Compute k = poseidon(spendPriv) locally to check for an existing entry.
        const pos = await getPoseidon();
        const F = pos.F;
        const kField = pos([BigInt(spendPriv)]);
        const k = "0x" + F.toObject(kField).toString(16).padStart(64, "0");
        const identityAddress = ethers.computeAddress(wallet.spendPub);

        // If the leaf is already in the tree, reuse its stored index.
        const existing = await lookupLeaf(k, identityAddress);
        let index, indexCommitment;
        if (existing.found) {
            index = existing.index;
            indexCommitment = existing.indexCommitment;
        } else {
            ({ index, indexCommitment } = await publishAccountLeaf(
                wallet.spendPriv,
                wallet.spendPub
            ));
        }

        const indexHash = await computeIndexHash(index);
        const full = { ...wallet, index, indexHash, indexCommitment };
        setMeta(full);
        return full;
    }

    /** Scans the blockchain for incoming stealth transfers. */
    async function scan() {
        if (!meta) return;
        setIsScanning(true);
        try {
            const wallets = await scanStealthPayments(meta);
            const enriched = wallets.map((w) => ({
                ...w,
                sendScanPub: "",
                sendSpendPub: "",
                sendAmount: "",
                sendTokenType: "ETH",
                sendTokenAddress: "",
                sendTokenId: "",
            }));
            setStealthWallets(enriched);
            return enriched;
        } finally {
            setIsScanning(false);
        }
    }

    /** Updates a single field in a discovered stealth wallet. */
    function updateWalletField(index, field, value) {
        setStealthWallets((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    }

    /**
     * Executes the full stealth payment pipeline from one of the user's
     * discovered stealth accounts.
     *
     * @param {number} index - Index into stealthWallets array
     * @returns {string} txHash on success
     */
    async function sendFromWallet(index) {
        const w = stealthWallets[index];
        if (!w.sendScanPub || !w.sendSpendPub || w.sendRecipientIndexHash === undefined || w.sendRecipientIndexHash === "") {
            throw new Error("Please enter recipient scan key, spend key, and account index hash.");
        }
        if (w.sendTokenType === "ETH" && !w.sendAmount) {
             throw new Error("Please enter ETH amount.");
        }
        if (w.sendTokenType === "ERC20" && (!w.sendTokenAddress || !w.sendAmount)) {
             throw new Error("Please enter ERC20 contract address and amount.");
        }
        if (w.sendTokenType === "ERC721" && (!w.sendTokenAddress || !w.sendTokenId)) {
             throw new Error("Please enter NFT contract address and token ID.");
        }

        setSendingIndex(index);
        setSendProgress("Starting...");

        try {
            const proofInput2 = w.sharedSecretHash || w.stealthEOA;
            if (!proofInput2) {
                throw new Error("Missing sender proof input. Please scan stealth transfers again before sending.");
            }
            const txHash = await executeStealthTransfer(
                {
                    address: w.address,
                    sharedSecretHash: proofInput2, // circuit input #2
                    indexCommitment: w.indexCommitment,
                    spendPriv: meta.spendPriv,      // private ZK circuit input x
                },
                { scanPub: w.sendScanPub, spendPub: w.sendSpendPub, indexHash: w.sendRecipientIndexHash },
                w.sendAmount,
                { tokenType: w.sendTokenType, tokenAddress: w.sendTokenAddress, tokenId: w.sendTokenId },
                (msg) => setSendProgress(msg)
            );

            // Reset send form fields
            updateWalletField(index, "sendScanPub", "");
            updateWalletField(index, "sendSpendPub", "");
            updateWalletField(index, "sendAmount", "");
            updateWalletField(index, "sendTokenAddress", "");
            updateWalletField(index, "sendTokenId", "");

            return txHash;
        } finally {
            setSendingIndex(null);
            setSendProgress("");
        }
    }

    return {
        // State
        isScanning,
        sendingIndex,
        sendProgress,
        scanPriv,
        setScanPriv,
        spendPriv,
        setSpendPriv,
        stealthWallets,
        // Actions
        createWallet,
        importWallet,
        scan,
        updateWalletField,
        sendFromWallet,
    };
}
