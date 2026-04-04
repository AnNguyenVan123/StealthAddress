import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useStealthWallet } from "../hooks/useStealthWallet";
import Send from "./Send";

// ─── UI Helpers ────────────────────────────────────────────────────────────────
const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function Wallet({ meta, setMeta }) {
    const [mode, setMode] = useState(null);

    const {
        isScanning,
        sendingIndex,
        sendProgress,
        scanPriv, setScanPriv,
        spendPriv, setSpendPriv,
        stealthWallets,
        createWallet,
        importWallet,
        scan,
        updateWalletField,
        sendFromWallet,
    } = useStealthWallet(meta, setMeta);

    // ─── Handlers ────────────────────────────────────────────────────────────

    async function handleCreate() {
        try {
            await createWallet();
            toast.success("New stealth wallet created & registered!");
        } catch (e) {
            toast.error(e.message);
        }
    }

    async function handleImport() {
        try {
            await importWallet();
            toast.success("Wallet imported & registered!");
        } catch (e) {
            toast.error(e.message);
        }
    }

    async function handleScan() {
        const toastId = toast.loading("Scanning blockchain for transfers...");
        try {
            const found = await scan();
            if (found.length > 0) {
                toast.success(`Found ${found.length} wallet(s)!`, { id: toastId });
            } else {
                toast("No transfers found yet.", { id: toastId, icon: "🔍" });
            }
        } catch (error) {
            console.error(error);
            toast.error("Error scanning transactions.", { id: toastId });
        }
    }

    async function handleSend(index) {
        const toastId = toast.loading("Starting stealth transfer...");
        try {
            // Progress updates forwarded from the service layer → toast
            const txHash = await sendFromWallet(index);
            toast.success(`Transfer done! TX: ${shortenAddress(txHash)}`, {
                id: toastId,
                duration: 6000,
            });
        } catch (error) {
            console.error(error);
            toast.error(error.message || "Transaction failed.", { id: toastId });
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard!");
    }

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 font-sans text-gray-800">
            <Toaster position="top-center" reverseOrder={false} />

            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

                {/* HEADER */}
                <div className="bg-gray-900 text-white p-6">
                    <h2 className="text-2xl font-bold">Stealth Wallet</h2>
                    <p className="text-sm text-gray-400 mt-1">Protect your transaction privacy</p>
                </div>

                <div className="p-6">

                    {/* ── SETUP: No wallet ── */}
                    {!meta && mode === null && (
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => setMode("create")}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
                            >
                                Create New Stealth Wallet
                            </button>
                            <button
                                onClick={() => setMode("import")}
                                className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                            >
                                Import Existing Wallet
                            </button>
                        </div>
                    )}

                    {/* ── IMPORT MODE ── */}
                    {!meta && mode === "import" && (
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Scan Private Key</label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="Enter 0x..."
                                    value={scanPriv}
                                    onChange={(e) => setScanPriv(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Spend Private Key</label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="Enter 0x..."
                                    value={spendPriv}
                                    onChange={(e) => setSpendPriv(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-3 mt-2">
                                <button
                                    onClick={() => setMode(null)}
                                    className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleImport}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                                >
                                    Confirm Import
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── CREATE CONFIRMATION ── */}
                    {!meta && mode === "create" && (
                        <div className="text-center py-4">
                            <p className="mb-6 text-gray-600">
                                A completely new stealth key pair will be generated. Store it safely.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setMode(null)}
                                    className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                                >
                                    Create Wallet Now
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── DASHBOARD ── */}
                    {meta && (
                        <div className="space-y-6">
                            {/* Meta-address card */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <h3 className="text-lg font-semibold mb-4 border-b pb-2">Your Meta Address</h3>

                                <div className="mb-3 flex justify-between items-center">
                                    <div>
                                        <span className="text-xs text-gray-500 font-bold uppercase">Scan Public Key</span>
                                        <p className="text-sm font-mono mt-1" title={meta.scanPub}>
                                            {shortenAddress(meta.scanPub)}
                                        </p>
                                    </div>
                                    <button onClick={() => copyToClipboard(meta.scanPub)} className="text-sm text-blue-600 hover:text-blue-800">Copy</button>
                                </div>

                                <div className="mb-3 flex justify-between items-center">
                                    <div>
                                        <span className="text-xs text-gray-500 font-bold uppercase">Spend Public Key</span>
                                        <p className="text-sm font-mono mt-1" title={meta.spendPub}>
                                            {shortenAddress(meta.spendPub)}
                                        </p>
                                    </div>
                                    <button onClick={() => copyToClipboard(meta.spendPub)} className="text-sm text-blue-600 hover:text-blue-800">Copy</button>
                                </div>

                                {meta.indexHash && (
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <span className="text-xs text-gray-500 font-bold uppercase">Account Index Hash</span>
                                            <p className="text-sm font-mono mt-1" title={meta.indexHash}>
                                                {shortenAddress(meta.indexHash)}
                                            </p>
                                        </div>
                                        <button onClick={() => copyToClipboard(meta.indexHash)} className="text-sm text-blue-600 hover:text-blue-800">Copy</button>
                                    </div>
                                )}
                            </div>

                            {/* Scan button */}
                            <button
                                onClick={handleScan}
                                disabled={isScanning}
                                className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isScanning ? (
                                    <>
                                        <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                        Scanning blockchain...
                                    </>
                                ) : (
                                    "Scan Stealth Transfers"
                                )}
                            </button>
                        </div>
                    )}

                    {/* ── FOUND WALLET LIST ── */}
                    {stealthWallets.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-xl font-bold mb-4">Found Wallets ({stealthWallets.length})</h3>
                            <div className="space-y-4">
                                {stealthWallets.map((w, i) => (
                                    <div
                                        key={i}
                                        className="border border-gray-200 rounded-xl p-4 shadow-sm bg-white hover:border-blue-300 transition-colors"
                                    >
                                        {/* Wallet header */}
                                        <div className="flex justify-between items-end mb-4 border-b pb-4">
                                            <div>
                                                <span className="text-xs text-gray-500 font-bold uppercase">Wallet Address</span>
                                                <p className="text-sm font-mono font-medium text-blue-600" title={w.address}>
                                                    {shortenAddress(w.address)}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs text-gray-500 font-bold uppercase">Balance</span>
                                                <p className="text-lg font-bold text-gray-800">{w.balance} ETH</p>
                                            </div>
                                        </div>

                                        {/* Send form */}
                                        <div className="space-y-3">
                                            <input
                                                className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono"
                                                placeholder="Recipient Scan Public Key (0x04...)"
                                                value={w.sendScanPub}
                                                onChange={(e) => updateWalletField(i, "sendScanPub", e.target.value)}
                                            />
                                            <input
                                                className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono"
                                                placeholder="Recipient Spend Public Key (0x04...)"
                                                value={w.sendSpendPub}
                                                onChange={(e) => updateWalletField(i, "sendSpendPub", e.target.value)}
                                            />
                                            <input
                                                className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono"
                                                placeholder="Recipient Account Index Hash (0x...)"
                                                value={w.sendRecipientIndexHash || ""}
                                                onChange={(e) => updateWalletField(i, "sendRecipientIndexHash", e.target.value)}
                                            />
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    className="flex-1 px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                                    placeholder="Amount in ETH"
                                                    value={w.sendAmount}
                                                    onChange={(e) => updateWalletField(i, "sendAmount", e.target.value)}
                                                />
                                                <button
                                                    onClick={() => handleSend(i)}
                                                    disabled={sendingIndex === i || !w.sendScanPub || !w.sendSpendPub || !w.sendRecipientIndexHash || !w.sendAmount}
                                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                                                >
                                                    {sendingIndex === i ? (sendProgress || "Sending...") : "Send ETH"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {meta && <Send />}
                </div>
            </div>
        </div>
    );
}