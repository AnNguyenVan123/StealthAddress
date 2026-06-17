import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useEnsLookup } from "../hooks/useEnsLookup";
import { formatError } from "../utils/errors";

// ─── UI Helpers ────────────────────────────────────────────────────────────────
const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!", { duration: 1500 });
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function EnsBadge({ ensNames, ensStatus }) {
    if (ensStatus === "loading") {
        return (
            <div className="flex items-center gap-2 px-2.5 py-1 glass-panel rounded-md text-xs text-slate-400 animate-pulse">
                <span className="inline-block w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                Checking ENS...
            </div>
        );
    }
    if (ensStatus === "found" && ensNames && ensNames.length > 0) {
        return (
            <div className="flex flex-wrap gap-1.5">
                {ensNames.map((name) => (
                    <button
                        key={name}
                        onClick={() => copyToClipboard(name)}
                        title={`Click to copy ${name}`}
                        className="group flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 border border-purple-500/30 hover:border-purple-500/60 rounded-md text-xs font-mono font-medium text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                    >
                        <span className="text-purple-500/50">#</span>
                        {name}
                        <span className="opacity-0 group-hover:opacity-100 text-[9px] text-purple-400 uppercase tracking-widest ml-1 transition-opacity">Copy</span>
                    </button>
                ))}
            </div>
        );
    }
    return null;
}

function AutoScanBanner({ autoScanStatus }) {
    if (autoScanStatus === "scanning") {
        return (
            <div className="flex items-center gap-3 px-4 py-3 bg-purple-900/20 border border-purple-500/30 rounded-xl text-sm text-purple-300 shadow-sm">
                <span className="inline-block w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-medium">Auto-scanning for incoming stealth transfers…</span>
            </div>
        );
    }
    if (autoScanStatus === "done") {
        return (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-900/20 border border-emerald-500/30 rounded-xl text-sm text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)] animate-in fade-in duration-500">
                <span className="text-emerald-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </span>
                <span className="font-medium">Chain scan complete — balances up to date.</span>
            </div>
        );
    }
    if (autoScanStatus === "error") {
        return (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-xl text-sm text-red-400 shadow-sm">
                <span className="text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </span>
                <span className="font-medium">Auto-scan failed. Use the manual scan button below.</span>
            </div>
        );
    }
    return null;
}

function TokenPill({ token }) {
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border"
            style={{ borderColor: token.color ? `${token.color}40` : "#e2e8f0", color: token.color || "#475569", backgroundColor: token.color ? `${token.color}10` : "#f8fafc" }}
        >
            {token.symbol} {token.balance}
        </span>
    );
}

function WalletCard({ w, i }) {
    const ethBal = parseFloat(w.balance || "0");
    const hasTokens = w.tokenBalances && w.tokenBalances.length > 0;
    const isActive = ethBal > 0 || hasTokens;

    return (
        <div className={`glass-panel rounded-xl overflow-hidden transition-all duration-200 hover:border-amber-500/50 ${isActive ? "border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]" : "border-slate-800 opacity-60 hover:opacity-100"}`}>
            {/* Card Header */}
            <div className="p-4 pb-3">
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${isActive ? "bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.8)]" : "bg-slate-600"}`} />
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Account #{i + 1}</span>
                        </div>
                        <button
                            onClick={() => copyToClipboard(w.address)}
                            className="group flex items-center gap-2 mt-1"
                            title="Click to copy address"
                        >
                            <span className="text-sm font-mono text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-700 group-hover:border-purple-500/50 group-hover:text-purple-400 transition-colors">
                                {shortenAddress(w.address)}
                            </span>
                        </button>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className={`text-2xl font-bold tracking-tight font-orbitron ${isActive ? "text-amber-500" : "text-slate-500"}`}>{ethBal.toFixed(5)}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">ETH</p>
                    </div>
                </div>

                {/* ERC-20 Token Balances */}
                {hasTokens && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {w.tokenBalances.map((t) => (
                            <TokenPill key={t.symbol} token={t} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function Wallet({ meta, setMeta, stealthState }) {
    const [mode, setMode] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    const {
        isScanning,
        scanPriv, setScanPriv,
        spendPriv, setSpendPriv,
        stealthWallets,
        autoScanStatus,
        createWallet,
        importWallet,
        scan,
    } = stealthState;

    const { ensName, ensNames, ensStatus } = useEnsLookup(meta);

    // ─── Handlers ────────────────────────────────────────────────────────────

    async function handleCreate() {
        setIsCreating(true);
        try {
            await createWallet();
            toast.success("New stealth wallet created & registered!");
        } catch (e) {
            console.error("Creation error:", e);
            toast.error(formatError(e));
        } finally {
            setIsCreating(false);
        }
    }

    async function handleImport() {
        try {
            await importWallet();
            toast.success("Wallet imported & registered!");
        } catch (e) {
            toast.error(formatError(e));
        }
    }

    async function handleScan() {
        const toastId = toast.loading("Scanning blockchain for transfers...");
        try {
            const found = await scan();
            if (found.length > 0) {
                toast.success(`Found ${found.length} wallet(s)!`, { id: toastId });
            } else {
                toast("No transfers found yet.", { id: toastId });
            }
        } catch (error) {
            console.error(error);
            toast.error("Error scanning transactions.", { id: toastId });
        }
    }

    // ── Total Assets Calculation ──────────────────────────────────────────────
    const totalEth = stealthWallets.reduce((acc, w) => acc + parseFloat(w.balance || "0"), 0);
    const walletCount = stealthWallets.length;
    const activeCount = stealthWallets.filter((w) => parseFloat(w.balance || "0") > 0 || (w.tokenBalances && w.tokenBalances.length > 0)).length;

    // Aggregate token totals across wallets
    const tokenTotals = {};
    stealthWallets.forEach((w) => {
        (w.tokenBalances || []).forEach((t) => {
            if (!tokenTotals[t.symbol]) tokenTotals[t.symbol] = { ...t, balance: 0 };
            tokenTotals[t.symbol].balance += parseFloat(t.balance || "0");
        });
    });
    const aggregatedTokens = Object.values(tokenTotals);

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="w-full flex flex-col">
            <Toaster position="bottom-right" reverseOrder={false} />

            <div className="w-full space-y-6">

                {/* ── SETUP: No wallet ── */}
                {!meta && mode === null && (
                    <div className="flex flex-col sm:flex-row gap-4 justify-center py-10">
                        <button
                            onClick={() => setMode("create")}
                            className="group relative flex-1 p-6 glass-panel border border-purple-500/20 hover:border-purple-500/50 rounded-2xl flex flex-col items-center gap-3 transition-all duration-300 shadow-sm hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                        >
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-1 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                            </div>
                            <h3 className="text-base font-bold text-slate-200 font-orbitron">Create New Bundle</h3>
                            <p className="text-slate-400 text-center text-xs px-4">Generate a fresh cryptographic bundle for ultimate privacy.</p>
                        </button>
                        <button
                            onClick={() => setMode("import")}
                            className="group relative flex-1 p-6 glass-panel border border-emerald-500/20 hover:border-emerald-500/50 rounded-2xl flex flex-col items-center gap-3 transition-all duration-300 shadow-sm hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                        >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1 group-hover:bg-emerald-500/20 group-hover:scale-110 transition-all duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                            </div>
                            <h3 className="text-base font-bold text-slate-200 font-orbitron">Import Existing</h3>
                            <p className="text-slate-400 text-center text-xs px-4">Load your previously generated stealth bundle keys.</p>
                        </button>
                    </div>
                )}

                {/* ── IMPORT / CREATE FORMS ── */}
                {!meta && (mode === "import" || mode === "create") && (
                    <div className="max-w-md mx-auto glass-panel p-6 sm:p-8 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-200 font-orbitron">
                                {mode === "import" ? "Import Wallet" : "Generate Keys"}
                            </h3>
                            <button onClick={() => setMode(null)} className="text-slate-400 hover:text-slate-200">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        
                        {mode === "import" ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Scan Private Key</label>
                                    <input
                                        type="password"
                                        className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-slate-200 font-mono text-sm transition-all"
                                        placeholder="0x..."
                                        value={scanPriv}
                                        onChange={(e) => setScanPriv(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Spend Private Key</label>
                                    <input
                                        type="password"
                                        className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none text-slate-200 font-mono text-sm transition-all"
                                        placeholder="0x..."
                                        value={spendPriv}
                                        onChange={(e) => setSpendPriv(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={handleImport}
                                    className="w-full mt-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg font-bold transition-all shadow-[0_0_10px_rgba(245,158,11,0.3)] hover:shadow-[0_0_15px_rgba(245,158,11,0.5)] font-orbitron tracking-wider"
                                >
                                    Import Wallet
                                </button>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="mb-6 text-sm text-slate-400 leading-relaxed">
                                    A completely new stealth key pair will be generated locally. You must store it safely off-chain once revealed in the Security Center.
                                </p>
                                <button
                                    onClick={handleCreate}
                                    disabled={isCreating}
                                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/50 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)] hover:shadow-[0_0_15px_rgba(139,92,246,0.5)] flex items-center justify-center gap-2 font-orbitron tracking-wider"
                                >
                                    {isCreating && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
                                    {isCreating ? "Generating..." : "Generate Bundle Now"}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── DASHBOARD ── */}
                {meta && (
                    <div className="space-y-6">

                        {/* Auto-scan status banner */}
                        <AutoScanBanner autoScanStatus={autoScanStatus} />

                        {/* Total Assets Highlight Card */}
                        <div className="glass-panel border-purple-500/10 rounded-2xl p-6 sm:p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                            <div className="flex flex-col md:flex-row justify-between gap-8">
                                
                                {/* Left: Balance */}
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Total Stealth Balance</h3>
                                        <div className="md:hidden">
                                            <EnsBadge ensNames={ensNames} ensStatus={ensStatus} />
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-baseline gap-2 mb-6">
                                        <span className="text-4xl sm:text-5xl font-extrabold text-amber-500 tracking-tight font-orbitron drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                                            {totalEth.toFixed(5)}
                                        </span>
                                        <span className="text-lg text-slate-500 font-semibold font-orbitron tracking-widest">ETH</span>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex flex-wrap items-center gap-2 mb-6">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/50 border border-slate-700 rounded-md">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
                                            <span className="text-[11px] font-medium text-slate-400">{activeCount} active</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/50 border border-slate-700 rounded-md">
                                            <span className="text-[11px] font-medium text-slate-400">{walletCount} accounts</span>
                                        </div>
                                    </div>

                                    {aggregatedTokens.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {aggregatedTokens.map((t) => (
                                                <TokenPill key={t.symbol} token={{ ...t, balance: t.balance.toFixed(t.decimals === 6 ? 2 : 5) }} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Right: Keys Info */}
                                <div className="flex-1 md:max-w-xs space-y-5 bg-slate-900/60 p-5 rounded-xl border border-slate-800 backdrop-blur-sm">
                                    <div className="hidden md:block mb-4">
                                        <EnsBadge ensNames={ensNames} ensStatus={ensStatus} />
                                    </div>
                                    
                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Meta-Address (Scan)</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-md px-2.5 py-1.5 group cursor-pointer hover:border-purple-500/50 transition-colors" onClick={() => copyToClipboard(meta.scanPub)}>
                                            <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200">{shortenAddress(meta.scanPub)}</span>
                                            <span className="text-[10px] text-purple-400 opacity-0 group-hover:opacity-100 uppercase font-bold tracking-wider">Copy</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Meta-Address (Spend)</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-md px-2.5 py-1.5 group cursor-pointer hover:border-purple-500/50 transition-colors" onClick={() => copyToClipboard(meta.spendPub)}>
                                            <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200">{shortenAddress(meta.spendPub)}</span>
                                            <span className="text-[10px] text-purple-400 opacity-0 group-hover:opacity-100 uppercase font-bold tracking-wider">Copy</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Index Hash</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-md px-2.5 py-1.5 group cursor-pointer hover:border-purple-500/50 transition-colors" onClick={() => copyToClipboard(meta.indexHash)}>
                                            <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200">{shortenAddress(meta.indexHash)}</span>
                                            <span className="text-[10px] text-purple-400 opacity-0 group-hover:opacity-100 uppercase font-bold tracking-wider">Copy</span>
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            onClick={handleScan}
                                            disabled={isScanning || autoScanStatus === "scanning"}
                                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 border border-slate-700 hover:border-slate-600"
                                        >
                                            {isScanning || autoScanStatus === "scanning" ? (
                                                <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full" />
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-5.65-2.03"/></svg>
                                            )}
                                            Refresh Scan
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── FOUND WALLET LIST ── */}
                        {walletCount > 0 && (
                            <div className="space-y-4 pt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-bold text-slate-200 font-orbitron">
                                        Stealth Accounts
                                    </h3>
                                    <span className="text-xs text-amber-500 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md">
                                        {activeCount} active / {walletCount} total
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {stealthWallets.map((w, i) => (
                                        <WalletCard
                                            key={i}
                                            w={w}
                                            i={i}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── EMPTY STATE (after scan, no wallets) ── */}
                        {walletCount === 0 && autoScanStatus === "done" && (
                            <div className="flex flex-col items-center justify-center py-12 glass-panel border border-slate-800 rounded-2xl text-center">
                                <div className="w-12 h-12 bg-slate-900/50 rounded-full flex items-center justify-center shadow-sm border border-slate-700 mb-4 text-slate-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                </div>
                                <h4 className="text-base font-bold text-slate-200 mb-1 font-orbitron">No incoming transfers</h4>
                                <p className="text-slate-400 text-sm max-w-sm mb-6">
                                    No stealth payments directed to your keys were found. Share your ENS to receive funds.
                                </p>
                                <button
                                    onClick={handleScan}
                                    className="px-5 py-2 glass-panel hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-all shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                                >
                                    Scan Blockchain
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}