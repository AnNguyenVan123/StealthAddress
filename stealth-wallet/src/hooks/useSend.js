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
    const [isSending, setIsSending] = useState(false);
    const [progress, setProgress] = useState("");

    /**
     * Validates inputs and delegates to the service layer.
     * @throws if inputs are invalid or the transaction fails.
     * @returns {string} txHash
     */
    async function send() {
        if (!scanPub || !spendPub || !recipientIndexHash || !amount) {
            throw new Error("Please fill in all fields.");
        }

        setIsSending(true);
        setProgress("Starting...");

        try {
            const txHash = await sendStealthPayment(
                { scanPub, spendPub, indexHash: recipientIndexHash },
                amount,
                (msg) => setProgress(msg)
            );

            // Reset form
            setScanPub("");
            setSpendPub("");
            setRecipientIndexHash("");
            setAmount("");

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
        isSending,
        progress,
        send,
    };
}
