import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { createMetaAddress } from "../stealth/crypto";
import { scanStealthPayments } from "../scanner/scannerEngine";
import { executeStealthTransfer } from "../services/stealthService";
import { publishAccountLeaf, lookupLeaf, computeIndexHash, getPoseidon } from "../stealth/zkIntegration";

// ── Well-known ERC-20 tokens on Sepolia ──────────────────────────────────────
const KNOWN_ERC20_TOKENS = [
    // Add known Sepolia testnet tokens here
    { symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6, color: "#2775CA" },
    { symbol: "LINK", address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", decimals: 18, color: "#375BD2" },
    { symbol: "WETH", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18, color: "#627EEA" },
];

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function name() view returns (string)",
];

const RPC = import.meta.env.VITE_RPC_URL;
const rpcProvider = new ethers.JsonRpcProvider(RPC);

/**
 * Fetch ETH + ERC-20 balances for a list of stealth wallet addresses.
 * Returns enriched wallet objects with { tokenBalances: [{symbol, balance, usdValue}] }
 */
async function enrichWithTokenBalances(wallets) {
    return Promise.all(wallets.map(async (w) => {
        const tokenBalances = await Promise.all(
            KNOWN_ERC20_TOKENS.map(async (token) => {
                try {
                    const contract = new ethers.Contract(token.address, ERC20_ABI, rpcProvider);
                    const raw = await contract.balanceOf(w.address);
                    const formatted = parseFloat(ethers.formatUnits(raw, token.decimals));
                    if (formatted > 0) {
                        return { ...token, balance: formatted.toFixed(token.decimals === 6 ? 2 : 5) };
                    }
                    return null;
                } catch {
                    return null;
                }
            })
        );
        return {
            ...w,
            tokenBalances: tokenBalances.filter(Boolean),
        };
    }));
}

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
    const [hasAutoScanned, setHasAutoScanned] = useState(false);
    const [autoScanStatus, setAutoScanStatus] = useState("idle"); // idle | scanning | done | error
    const prevMetaRef = useRef(null);

    // ── Auto-scan on first wallet load ────────────────────────────────────────
    useEffect(() => {
        if (!meta || hasAutoScanned) return;
        // Only trigger if meta just changed from null → something
        if (prevMetaRef.current !== null) return;

        prevMetaRef.current = meta;
        setHasAutoScanned(true);
        setAutoScanStatus("scanning");

        async function autoScan() {
            try {
                const wallets = await scanStealthPayments(meta);
                const withTokens = await enrichWithTokenBalances(wallets);
                setStealthWallets(withTokens);
                setAutoScanStatus("done");
            } catch (err) {
                console.error("[auto-scan] failed:", err);
                setAutoScanStatus("error");
            }
        }

        autoScan();
    }, [meta, hasAutoScanned]);

    useEffect(() => {
        if (meta) prevMetaRef.current = meta;
    }, [meta]);

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
        console.log("index-hash:", indexHash);
        const full = { ...wallet, index, indexHash };
        setMeta(full);
        prevMetaRef.current = null; // allow auto-scan to trigger
        setHasAutoScanned(false);
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
        prevMetaRef.current = null; // allow auto-scan to trigger
        setHasAutoScanned(false);
        setMeta(full);
        return full;
    }

    /** Scans the blockchain for incoming stealth transfers + enriches with ERC-20. */
    async function scan() {
        if (!meta) return;
        setIsScanning(true);
        try {
            const wallets = await scanStealthPayments(meta);
            const withTokens = await enrichWithTokenBalances(wallets);
            setStealthWallets(withTokens);
            return withTokens;
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
     * @param {object} recipient - { scanPub, spendPub, indexHash }
     * @param {object} asset - { tokenType, amount, tokenAddress, tokenId }
     * @returns {string} txHash on success
     */
    async function sendFromWallet(index, recipient, asset) {
        const w = stealthWallets[index];
        if (!w) throw new Error("Invalid stealth wallet selected.");
        
        if (!recipient.scanPub || !recipient.spendPub || recipient.indexHash === undefined || recipient.indexHash === "") {
            throw new Error("Please enter recipient scan key, spend key, and account index hash.");
        }
        if (asset.tokenType === "ETH" && !asset.amount) {
             throw new Error("Please enter ETH amount.");
        }
        if (asset.tokenType === "ERC20" && (!asset.tokenAddress || !asset.amount)) {
             throw new Error("Please enter ERC20 contract address and amount.");
        }
        if (asset.tokenType === "ERC721" && (!asset.tokenAddress || !asset.tokenId)) {
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
                    sharedSecretHash: proofInput2,
                    indexCommitment: w.indexCommitment,
                    spendPriv: meta.spendPriv,
                },
                recipient,
                asset.amount,
                { tokenType: asset.tokenType, tokenAddress: asset.tokenAddress, tokenId: asset.tokenId },
                (msg) => setSendProgress(msg)
            );

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
        autoScanStatus,
        // Actions
        createWallet,
        importWallet,
        scan,
        updateWalletField,
        sendFromWallet,
    };
}
