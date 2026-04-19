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

    // Calculate Total Assets
    const totalAssets = stealthWallets.reduce((acc, w) => acc + parseFloat(w.balance || "0"), 0).toFixed(4);

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="w-full flex flex-col items-center">
            <Toaster position="top-center" reverseOrder={false}
                toastOptions={{
                    style: {
                        background: '#1f2022',
                        color: '#fff',
                        border: '1px solid #333'
                    }
                }}
            />

            <div className="w-full max-w-4xl space-y-8">

                {/* ── SETUP: No wallet ── */}
                {!meta && mode === null && (
                    <div className="flex flex-col md:flex-row gap-6 justify-center">
                        <button
                            onClick={() => setMode("create")}
                            className="group relative px-8 py-12 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/50 rounded-3xl flex flex-col items-center gap-4 transition-all duration-300"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                ✨
                            </div>
                            <h3 className="text-xl font-bold">Create New Wallet</h3>
                            <p className="text-gray-400 text-center text-sm">Generate a fresh cryptographic bundle for ultimate privacy.</p>
                        </button>
                        <button
                            onClick={() => setMode("import")}
                            className="group relative px-8 py-12 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-3xl flex flex-col items-center gap-4 transition-all duration-300"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                🔑
                            </div>
                            <h3 className="text-xl font-bold">Import Existing</h3>
                            <p className="text-gray-400 text-center text-sm">Load your previously generated stealth bundle.</p>
                        </button>
                    </div>
                )}

                {/* ── IMPORT MODE ── */}
                {!meta && mode === "import" && (
                    <div className="max-w-md mx-auto bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95">
                        <h3 className="text-2xl font-bold mb-6 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Import Wallet</h3>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Scan Private Key</label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none text-white font-mono transition-all"
                                    placeholder="Enter 0x..."
                                    value={scanPriv}
                                    onChange={(e) => setScanPriv(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Spend Private Key</label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none text-white font-mono transition-all"
                                    placeholder="Enter 0x..."
                                    value={spendPriv}
                                    onChange={(e) => setSpendPriv(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-4 mt-6">
                                <button
                                    onClick={() => setMode(null)}
                                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleImport}
                                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-500/30 rounded-xl font-medium transition-all"
                                >
                                    Import
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── CREATE CONFIRMATION ── */}
                {!meta && mode === "create" && (
                    <div className="max-w-md mx-auto bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl text-center animate-in fade-in zoom-in-95">
                        <div className="w-20 h-20 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center text-4xl mb-6">
                            🔒
                        </div>
                        <h3 className="text-2xl font-bold mb-4">Generate Keys</h3>
                        <p className="mb-8 text-gray-400">
                            A completely new stealth key pair will be generated. Store it safely off-chain once revealed.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setMode(null)}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-500/30 rounded-xl font-medium transition-all"
                            >
                                Generate Now
                            </button>
                        </div>
                    </div>
                )}

                {/* ── DASHBOARD ── */}
                {meta && (
                    <div className="space-y-6">
                        
                        {/* Total Assets Highlight Card */}
                        <div className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px]" />
                            <h3 className="text-gray-400 font-medium mb-2 uppercase tracking-wide text-sm">Total Stealth Assets</h3>
                            <div className="flex items-end gap-3">
                                <span className="text-5xl font-extrabold text-white tracking-tight pulse-glow">{totalAssets}</span>
                                <span className="text-xl text-blue-400 font-bold mb-1">ETH</span>
                            </div>
                            
                            <div className="mt-8 pt-8 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-white/5 pb-2">Meta Address</h4>
                                    <div className="group flex justify-between items-center relative">
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Scan Pub</span>
                                            <p className="text-sm font-mono text-gray-300">{shortenAddress(meta.scanPub)}</p>
                                        </div>
                                        <button onClick={() => copyToClipboard(meta.scanPub)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all text-xs text-blue-400 uppercase tracking-wider font-bold">Copy</button>
                                    </div>
                                    <div className="group flex justify-between items-center relative">
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Spend Pub</span>
                                            <p className="text-sm font-mono text-gray-300">{shortenAddress(meta.spendPub)}</p>
                                        </div>
                                        <button onClick={() => copyToClipboard(meta.spendPub)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all text-xs text-blue-400 uppercase tracking-wider font-bold">Copy</button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-white/5 pb-2">Identity Hub</h4>
                                    <div className="group flex justify-between items-center relative">
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Index Hash</span>
                                            <p className="text-sm font-mono text-blue-300">{shortenAddress(meta.indexHash)}</p>
                                        </div>
                                        <button onClick={() => copyToClipboard(meta.indexHash)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all text-xs text-blue-400 uppercase tracking-wider font-bold">Copy</button>
                                    </div>
                                    <div className="pt-2">
                                        <button
                                            onClick={handleScan}
                                            disabled={isScanning}
                                            className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 border border-white/5 hover:border-white/20"
                                        >
                                            {isScanning ? (
                                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                            ) : (
                                                <span className="text-lg">📡</span>
                                            )}
                                            {isScanning ? "Scanning Chain..." : "Scan For Incoming Transfers"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── FOUND WALLET LIST ── */}
                        {stealthWallets.length > 0 && (
                            <div className="mt-8 space-y-4">
                                <h3 className="text-xl font-bold flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm border border-green-500/30">{stealthWallets.length}</span>
                                    Active Hidden Balances
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {stealthWallets.map((w, i) => (
                                        <div
                                            key={i}
                                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 hover:border-blue-500/30 transition-colors"
                                        >
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">AA Stealth Address</span>
                                                    <p className="text-sm font-mono text-gray-300 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">{shortenAddress(w.address)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-extrabold text-blue-400">{w.balance}</p>
                                                    <p className="text-xs text-gray-500 font-bold uppercase">ETH</p>
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-4 border-t border-white/5">
                                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Internal Transfer</p>
                                                <input
                                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-xs font-mono text-gray-300 placeholder-gray-600"
                                                    placeholder="Recipient Scan Public Key"
                                                    value={w.sendScanPub || ""}
                                                    onChange={(e) => updateWalletField(i, "sendScanPub", e.target.value)}
                                                />
                                                <input
                                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-xs font-mono text-gray-300 placeholder-gray-600"
                                                    placeholder="Recipient Spend Public Key"
                                                    value={w.sendSpendPub || ""}
                                                    onChange={(e) => updateWalletField(i, "sendSpendPub", e.target.value)}
                                                />
                                                <input
                                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-xs font-mono text-gray-300 placeholder-gray-600"
                                                    placeholder="Recipient Index Hash"
                                                    value={w.sendRecipientIndexHash || ""}
                                                    onChange={(e) => updateWalletField(i, "sendRecipientIndexHash", e.target.value)}
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-xs text-gray-300 placeholder-gray-600"
                                                        placeholder="Amount ETH"
                                                        value={w.sendAmount || ""}
                                                        onChange={(e) => updateWalletField(i, "sendAmount", e.target.value)}
                                                    />
                                                    <button
                                                        onClick={() => handleSend(i)}
                                                        disabled={sendingIndex === i || !w.sendScanPub || !w.sendSpendPub || !w.sendRecipientIndexHash || !w.sendAmount}
                                                        className="px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                    >
                                                        {sendingIndex === i ? (sendProgress || "...") : "Send ZKP"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}