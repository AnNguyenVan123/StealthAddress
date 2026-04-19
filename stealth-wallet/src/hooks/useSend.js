import { useState } from "react";
import { sendStealthPayment } from "../services/stealthService";

/**
 * useSend
 *
 * Manages form state and orchestrates the MetaMask-based stealth send flow.
 * Used by the Send.jsx component.
 */
export function useSend() {
    const [scanPub, setScanPub]   = useState("");
    const [spendPub, setSpendPub] = useState("");
    const [recipientIndexHash, setRecipientIndexHash] = useState("");
    const [amount, setAmount]     = useState("");
    const [tokenType, setTokenType] = useState("ETH");
    const [tokenAddress, setTokenAddress] = useState("");
    const [tokenId, setTokenId] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [progress, setProgress] = useState("");

    /**
     * Validates inputs and delegates to the service layer.
     * @throws if inputs are invalid or the transaction fails.
     * @returns {string} txHash
     */
    async function send() {
        if (!scanPub || !spendPub || !recipientIndexHash) {
            throw new Error("Please fill in recipient information.");
        }
        if (tokenType !== "ERC721" && !amount) {
            throw new Error("Please enter transfer amount.");
        }
        if (tokenType !== "ETH" && !tokenAddress) {
            throw new Error("Please enter token contract address.");
        }
        if (tokenType === "ERC721" && !tokenId) {
            throw new Error("Please enter token ID.");
        }

        setIsSending(true);
        setProgress("Starting...");

        try {
            const txHash = await sendStealthPayment(
                { scanPub, spendPub, indexHash: recipientIndexHash },
                amount,
                { tokenType, tokenAddress, tokenId },
                (msg) => setProgress(msg)
            );

            // Reset form
            setScanPub("");
            setSpendPub("");
            setRecipientIndexHash("");
            setAmount("");
            setTokenType("ETH");
            setTokenAddress("");
            setTokenId("");

            return txHash;
        } finally {
            setIsSending(false);
            setProgress("");
        }
    }

    return {
        scanPub, setScanPub,
        spendPub, setSpendPub,
        recipientIndexHash, setRecipientIndexHash,
        amount, setAmount,
        tokenType, setTokenType,
        tokenAddress, setTokenAddress,
        tokenId, setTokenId,
        isSending,
        progress,
        send,
    };
}
