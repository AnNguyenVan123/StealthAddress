import toast, { Toaster } from "react-hot-toast";
import { useSend } from "../hooks/useSend";

export default function Send() {
    const {
        scanPub, setScanPub,
        spendPub, setSpendPub,
        recipientIndexHash, setRecipientIndexHash,
        amount, setAmount,
        isSending,
        progress,
        send,
    } = useSend();

    async function handleSend() {
        const toastId = toast.loading("Preparing stealth payment...");
        try {
            const txHash = await send();
            toast.success("Stealth payment sent and tree updated!", {
                id: toastId,
                duration: 5000,
            });
            console.log("Announce tx:", txHash);
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Transaction failed.", { id: toastId });
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <Toaster position="top-center" reverseOrder={false} />

            <h3 className="text-lg font-semibold">Send Stealth Payment</h3>

            <p className="text-sm text-gray-500">
                A smart Abstract Account will be deployed for the recipient's stealth
                address — they control it with their derived stealth key.
            </p>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Scan Public Key
                </label>
                <input
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-mono"
                    placeholder="0x04..."
                    value={scanPub}
                    onChange={e => setScanPub(e.target.value)}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Spend Public Key
                </label>
                <input
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-mono"
                    placeholder="0x04..."
                    value={spendPub}
                    onChange={e => setSpendPub(e.target.value)}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Account Index Hash
                </label>
                <input
                    type="text"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-mono"
                    placeholder="0x..."
                    value={recipientIndexHash}
                    onChange={e => setRecipientIndexHash(e.target.value)}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (ETH)
                </label>
                <input
                    type="number"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    placeholder="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                />
            </div>

            <button
                onClick={handleSend}
                disabled={isSending}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
                {isSending ? (
                    <>
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        {progress || "Sending..."}
                    </>
                ) : (
                    "Send via Abstract Account"
                )}
            </button>
        </div>
    );
}