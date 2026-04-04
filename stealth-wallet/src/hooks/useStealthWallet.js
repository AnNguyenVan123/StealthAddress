import { useState } from "react";
import { ethers } from "ethers";
import { createMetaAddress } from "../stealth/crypto";
import { scanStealthPayments } from "../scanner/scannerEngine";
import { executeStealthTransfer } from "../services/stealthService";
import { publishAccountLeaf, computeIndexHash } from "../stealth/zkIntegration";

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
        const { index, indexCommitment } = await publishAccountLeaf(
            wallet.spendPriv,
            wallet.spendPub
        );
        const indexHash = await computeIndexHash(index);
        const full = { ...wallet, index, indexHash, indexCommitment };
        setMeta(full);
        return full;
    }

    /** Imports an existing wallet from scan + spend private keys and re-publishes its leaf. */
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
        const { index, indexCommitment } = await publishAccountLeaf(
            wallet.spendPriv,
            wallet.spendPub
        );
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
        if (!w.sendScanPub || !w.sendSpendPub || !w.sendAmount || w.sendRecipientIndexHash === undefined || w.sendRecipientIndexHash === "") {
            throw new Error("Please enter recipient scan key, spend key, account index hash, and ETH amount.");
        }

        setSendingIndex(index);
        setSendProgress("Starting...");

        try {
            const txHash = await executeStealthTransfer(
                {
                    address: w.address,
                    stealthEOA: w.stealthEOA,
                    indexCommitment: w.indexCommitment,
                    spendPriv: meta.spendPriv,      // private ZK circuit input x
                },
                { scanPub: w.sendScanPub, spendPub: w.sendSpendPub, indexHash: w.sendRecipientIndexHash },
                w.sendAmount,
                (msg) => setSendProgress(msg)
            );

            // Reset send form fields
            updateWalletField(index, "sendScanPub", "");
            updateWalletField(index, "sendSpendPub", "");
            updateWalletField(index, "sendAmount", "");

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
