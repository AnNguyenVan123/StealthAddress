import { useState, useCallback, useRef, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useSend } from "../hooks/useSend";
import { useEnsResolver } from "../hooks/useEnsResolver";
import { formatError } from "../utils/errors";

export default function Send({ meta, stealthState }) {
    const {
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
    } = useSend();

    const { stealthWallets, sendFromWallet, sendingIndex, sendProgress } = stealthState || {};

    const [fundingSource, setFundingSource] = useState("metamask");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [selectedAssetId, setSelectedAssetId] = useState("ETH");
    const [assetDropdownOpen, setAssetDropdownOpen] = useState(false);
    const assetDropdownRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
            if (assetDropdownRef.current && !assetDropdownRef.current.contains(event.target)) {
                setAssetDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const ICONS = {
        wallet: <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
        stealth: <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
        eth: <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11.999 3.141-8.46 14.017L11.999 22l8.46-4.842L11.999 3.141z"/><path d="m11.999 15.632-8.46-4.842L11.999 6l8.46 4.79-8.46 4.842z"/></svg>,
        coin: <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>,
        nft: <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
        custom: <svg className="w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
    };

    // Compute valid funding options
    const sourceOptions = [
        { value: "metamask", label: "Connected Public Wallet (MetaMask)", icon: ICONS.wallet }
    ];
    if (stealthWallets) {
        stealthWallets.forEach((w, i) => {
            const bal = parseFloat(w.balance || "0");
            const hasTokens = w.tokenBalances && w.tokenBalances.length > 0;
            if (bal > 0 || hasTokens) {
                sourceOptions.push({
                    value: i.toString(),
                    label: `Stealth Account #${i + 1} (${bal.toFixed(5)} ETH)`,
                    icon: ICONS.stealth
                });
            }
        });
    }
    const selectedOption = sourceOptions.find(o => o.value === fundingSource) || sourceOptions[0];

    // Compute available assets based on funding source
    const availableAssets = [];
    if (fundingSource === "metamask") {
        availableAssets.push({ id: "ETH", type: "ETH", label: "ETH (Ethereum)", address: "", icon: ICONS.eth });
        availableAssets.push({ id: "CUSTOM_ERC20", type: "ERC20", label: "Custom ERC-20 Token", address: "", icon: ICONS.custom });
        availableAssets.push({ id: "CUSTOM_ERC721", type: "ERC721", label: "Custom ERC-721 NFT", address: "", icon: ICONS.nft });
    } else {
        const wIndex = parseInt(fundingSource, 10);
        const wallet = stealthWallets && stealthWallets[wIndex];
        if (wallet) {
            availableAssets.push({
                id: "ETH",
                type: "ETH",
                label: `ETH (Bal: ${parseFloat(wallet.balance || "0").toFixed(5)})`,
                address: "",
                icon: ICONS.eth
            });
            if (wallet.tokenBalances) {
                wallet.tokenBalances.forEach(t => {
                    availableAssets.push({
                        id: `ERC20-${t.address}`,
                        type: "ERC20",
                        label: `${t.symbol} (Bal: ${t.balance})`,
                        address: t.address,
                        icon: ICONS.coin
                    });
                });
            }
            availableAssets.push({ id: "CUSTOM_ERC20", type: "ERC20", label: "Custom ERC-20 Token", address: "", icon: ICONS.custom });
            availableAssets.push({ id: "CUSTOM_ERC721", type: "ERC721", label: "Custom ERC-721 NFT", address: "", icon: ICONS.nft });
        }
    }

    const selectedAsset = availableAssets.find(a => a.id === selectedAssetId) || availableAssets[0];

    // Reset asset selection when funding source changes
    useEffect(() => {
        setSelectedAssetId("ETH");
        setTokenType("ETH");
        setTokenAddress("");
    }, [fundingSource, setTokenType, setTokenAddress]);

    const handleAssetChange = (id) => {
        setSelectedAssetId(id);
        const asset = availableAssets.find(a => a.id === id);
        if (asset) {
            setTokenType(asset.type);
            if (asset.id.startsWith("ERC20-")) {
                setTokenAddress(asset.address);
            } else {
                setTokenAddress("");
            }
        }
        setAssetDropdownOpen(false);
    };

    const isCustomAsset = selectedAssetId.startsWith("CUSTOM_");

    // Called when ENS resolves or clears
    const handleEnsResolved = useCallback((result) => {
        if (result) {
            setScanPub(result.scanPub);
            setSpendPub(result.spendPub);
            setRecipientIndexHash(result.indexHash);
        } else {
            // Only clear if previously auto-filled (optional)
        }
    }, [setScanPub, setSpendPub, setRecipientIndexHash]);

    const {
        ensInput,
        handleEnsInput,
        ensStatus,
        ensError,
        ensResolved,
        clearEns,
    } = useEnsResolver(handleEnsResolved);

    async function handleSend() {
        const toastId = toast.loading("Preparing stealth payment...");
        try {
            let txHash;
            if (fundingSource === "metamask") {
                txHash = await send();
            } else {
                const wIndex = parseInt(fundingSource, 10);
                txHash = await sendFromWallet(
                    wIndex, 
                    { scanPub, spendPub, indexHash: recipientIndexHash },
                    { tokenType, tokenAddress, tokenId, amount }
                );
            }

            // Log local activity
            try {
                const historyStr = localStorage.getItem("stealth_activity");
                const history = historyStr ? JSON.parse(historyStr) : [];
                history.push({
                    timestamp: Date.now(),
                    recipient: ensResolved ? ensResolved.ensName : scanPub,
                    amount: tokenType === "ERC721" ? `NFT #${tokenId}` : amount,
                    tokenSymbol: tokenType === "ETH" ? "ETH" : "Tokens",
                    txHash: txHash
                });
                localStorage.setItem("stealth_activity", JSON.stringify(history));
            } catch (e) {
                console.error("Failed to save local activity", e);
            }

            toast.success("Stealth payment sent!", {
                id: toastId,
                duration: 5000,
            });
            clearEns();
            console.log("Announce tx:", txHash);
        } catch (err) {
            console.error(err);
            toast.error(formatError(err), { id: toastId });
        }
    }

    const isManualMode = !ensResolved;
    const isCurrentlySending = fundingSource === "metamask" ? isSending : (sendingIndex !== null);
    const currentProgress = fundingSource === "metamask" ? progress : sendProgress;

    return (
        <div className="w-full max-w-xl mx-auto animate-in fade-in zoom-in-95">
            <Toaster position="bottom-right" reverseOrder={false} />

            <div className="glass-panel border-purple-500/20 rounded-3xl p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
                
                <h3 className="text-2xl font-extrabold mb-2 text-slate-200 tracking-tight font-orbitron">
                    Direct Transfer
                </h3>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                    Fund a recipient's Stealth Abstract Account privately from your wallet.
                </p>

                <div className="space-y-6 relative z-10">

                    {/* ── Funding Source ── */}
                    <div className="relative z-50" ref={dropdownRef}>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Funding Source
                        </label>
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl outline-none text-sm font-medium text-slate-300 shadow-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all hover:border-slate-600 hover:shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                        >
                            <span className="flex items-center gap-3">
                                {selectedOption.icon}
                                <span>{selectedOption.label}</span>
                            </span>
                            <span className={`text-slate-500 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </span>
                        </button>

                        {dropdownOpen && (
                            <div className="absolute w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                {sourceOptions.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => {
                                            setFundingSource(opt.value);
                                            setDropdownOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all text-left ${
                                            fundingSource === opt.value 
                                            ? "bg-purple-900/40 text-purple-300 font-semibold" 
                                            : "hover:bg-slate-700 text-slate-400"
                                        }`}
                                    >
                                        {opt.icon}
                                        {opt.label}
                                        {fundingSource === opt.value && (
                                            <span className="ml-auto text-amber-500">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── ENS Resolution ── */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span>Recipient</span>
                            <span className="normal-case text-indigo-500 font-medium border border-indigo-200 rounded-md px-1.5 py-0.5 bg-indigo-50">
                                ENS or Manual
                            </span>
                        </label>

                        {/* ENS Input */}
                        <div className="relative">
                            <input
                                className={`w-full px-4 py-3 pr-10 bg-slate-900/50 border rounded-xl outline-none text-sm font-mono placeholder-slate-600 transition-all shadow-[0_0_10px_rgba(0,0,0,0.3)] ${
                                    ensStatus === "resolved"
                                        ? "border-emerald-500/50 text-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                                        : ensStatus === "error"
                                        ? "border-red-500/50 text-red-400 focus:ring-2 focus:ring-red-500/20"
                                        : "border-slate-700 text-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                }`}
                                placeholder="alice.eth — or fill fields manually"
                                value={ensInput}
                                onChange={e => handleEnsInput(e.target.value)}
                                id="ens-input"
                            />

                            {/* Status icon */}
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                                {ensStatus === "resolving" && (
                                    <span className="inline-block animate-spin h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full" />
                                )}
                                {ensStatus === "resolved" && <span>✅</span>}
                                {ensStatus === "error" && <span>❌</span>}
                                {ensStatus === "idle" && ensInput === "" && (
                                    <span className="text-slate-400 text-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* ENS resolved badge */}
                        {ensStatus === "resolved" && ensResolved && (
                            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2.5">
                                <span className="text-emerald-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                </span>
                                <span className="font-mono">Resolved: <span className="font-bold">{ensResolved.ensName}</span></span>
                                <span className="text-emerald-500/50">→</span>
                                <span className="font-mono truncate text-emerald-500/80">{ensResolved.address.slice(0, 10)}...{ensResolved.address.slice(-6)}</span>
                                <button
                                    onClick={clearEns}
                                    className="ml-auto text-emerald-400 hover:text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/40 px-1.5 py-0.5 rounded transition-colors"
                                    title="Clear ENS"
                                >✕</button>
                            </div>
                        )}

                        {/* ENS error badge */}
                        {ensStatus === "error" && (
                            <div className="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
                                <span className="text-red-500 mt-0.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                </span>
                                {ensError}
                            </div>
                        )}
                    </div>

                    {/* ── Divider ── */}
                    <div className="flex items-center gap-3 py-2">
                        <div className="flex-1 h-px bg-slate-700" />
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-slate-900 px-2 rounded">
                            {ensResolved ? "Auto-filled from ENS" : "Or enter manually"}
                        </span>
                        <div className="flex-1 h-px bg-slate-700" />
                    </div>

                    {/* ── Manual Key Fields ── */}
                    <div className={`space-y-4 transition-opacity duration-300 ${ensResolved ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Recipient Scan Public Key
                            </label>
                            <input
                                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                placeholder="0x04..."
                                value={scanPub}
                                onChange={e => { setScanPub(e.target.value); clearEns(); }}
                                readOnly={!!ensResolved}
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Recipient Spend Public Key
                            </label>
                            <input
                                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                placeholder="0x04..."
                                value={spendPub}
                                onChange={e => { setSpendPub(e.target.value); clearEns(); }}
                                readOnly={!!ensResolved}
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Recipient Identity Hash (Index)
                            </label>
                            <input
                                type="text"
                                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                placeholder="0x..."
                                value={recipientIndexHash}
                                onChange={e => { setRecipientIndexHash(e.target.value); clearEns(); }}
                                readOnly={!!ensResolved}
                            />
                        </div>
                    </div>

                    {/* ── Divider ── */}
                    <div className="h-px bg-slate-700 my-6" />

                    {/* ── Token Type & Amount ── */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1 relative z-40" ref={assetDropdownRef}>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Asset to Send
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setAssetDropdownOpen(!assetDropdownOpen)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg outline-none text-sm font-medium text-slate-300 shadow-[0_0_10px_rgba(0,0,0,0.3)] focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all hover:border-slate-600 hover:shadow"
                                >
                                    <span className="flex items-center gap-2 truncate">
                                        {selectedAsset?.icon}
                                        <span className="truncate">{selectedAsset?.label}</span>
                                    </span>
                                    <span className={`text-slate-500 transition-transform duration-200 flex-shrink-0 ${assetDropdownOpen ? "rotate-180" : ""}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                    </span>
                                </button>

                                {assetDropdownOpen && (
                                    <div className="absolute left-0 w-max min-w-[220px] mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                        {availableAssets.map((opt) => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => handleAssetChange(opt.id)}
                                                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-all text-left ${
                                                    selectedAssetId === opt.id 
                                                    ? "bg-purple-900/40 text-purple-300 font-semibold" 
                                                    : "hover:bg-slate-700 text-slate-400"
                                                }`}
                                            >
                                                {opt.icon}
                                                {opt.label}
                                                {selectedAssetId === opt.id && (
                                                    <span className="ml-auto text-amber-500">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            <div className="col-span-2">
                                {tokenType === "ERC721" ? (
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                            Token ID
                                        </label>
                                        <input
                                            className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                            placeholder="e.g. 42"
                                            value={tokenId}
                                            onChange={e => setTokenId(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                            Transfer Amount
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2.5 pl-8 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-base font-bold text-amber-500 font-orbitron placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                                placeholder="0.00"
                                                value={amount}
                                                onChange={e => setAmount(e.target.value)}
                                            />
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 font-bold">Ξ</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {(tokenType === "ERC20" || tokenType === "ERC721") && (
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Token Contract Address
                                </label>
                                <input
                                    className={`w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all ${!isCustomAsset ? 'opacity-70 bg-slate-800' : ''}`}
                                    placeholder="0x..."
                                    value={tokenAddress}
                                    onChange={e => setTokenAddress(e.target.value)}
                                    readOnly={!isCustomAsset}
                                />
                            </div>
                        )}
                    </div>

                    {/* ── Submit ── */}
                    <div className="pt-6">
                        <button
                            onClick={handleSend}
                            disabled={
                                isCurrentlySending ||
                                !scanPub || !spendPub || !recipientIndexHash ||
                                (tokenType !== "ERC721" && !amount) ||
                                (tokenType !== "ETH" && !tokenAddress) ||
                                (tokenType === "ERC721" && !tokenId) ||
                                ensStatus === "resolving"
                            }
                            className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/50 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold tracking-widest font-orbitron rounded-xl transition-all flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:shadow-[0_0_25px_rgba(139,92,246,0.6)]"
                        >
                            {isCurrentlySending ? (
                                <>
                                    <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                                    {currentProgress || "Broadcasting..."}
                                </>
                            ) : ensStatus === "resolving" ? (
                                <>
                                    <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                                    Resolving ENS...
                                </>
                            ) : (
                                <>
                                    {ensResolved ? `Send to ${ensResolved.ensName}` : "Send Stealth Payment"}
                                </>
                            )}
                        </button>

                        {/* ENS tip */}
                        <p className="text-center text-[11px] text-slate-400 mt-4 flex items-center justify-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                            Recipients can register their stealth keys on ENS for easy discovery
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}