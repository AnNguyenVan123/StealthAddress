import { useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useSend } from "../hooks/useSend";
import { useEnsResolver } from "../hooks/useEnsResolver";

export default function Send() {
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

    // Called when ENS resolves or clears
    const handleEnsResolved = useCallback((result) => {
        if (result) {
            setScanPub(result.scanPub);
            setSpendPub(result.spendPub);
            setRecipientIndexHash(result.indexHash);
        } else {
            // Only clear if previously auto-filled (optional: you can remove these if you want manual input to persist)
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
            const txHash = await send();
            toast.success("Stealth payment sent!", {
                id: toastId,
                duration: 5000,
            });
            clearEns();
            console.log("Announce tx:", txHash);
        } catch (err) {
            console.error(err);
            toast.error(err.message || "Transaction failed.", { id: toastId });
        }
    }

    const isManualMode = !ensResolved;

    return (
        <div className="w-full max-w-xl mx-auto animate-in fade-in zoom-in-95">
            <Toaster position="top-center" reverseOrder={false}
                toastOptions={{
                    style: {
                        background: '#1f2022',
                        color: '#fff',
                        border: '1px solid #333'
                    }
                }}
            />

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                {/* Decorative background */}
                <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-blue-500/20 rounded-full blur-[60px]" />
                <div className="absolute bottom-[-60px] left-[-30px] w-40 h-40 bg-purple-500/10 rounded-full blur-[50px]" />

                <h3 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Direct External Transfer
                </h3>
                <p className="text-sm text-gray-400 mb-8 max-w-sm">
                    Fund a recipient's Stealth Abstract Account directly from your MetaMask.
                </p>

                <div className="space-y-5 relative z-10">

                    {/* ── ENS Resolution ── */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span>Recipient</span>
                            <span className="text-[10px] normal-case text-blue-400 font-normal border border-blue-400/30 rounded px-1.5 py-0.5 bg-blue-400/5">
                                ENS or manual
                            </span>
                        </label>

                        {/* ENS Input */}
                        <div className="relative">
                            <input
                                className={`w-full px-4 py-3 pr-10 bg-black/40 border rounded-xl outline-none text-sm font-mono placeholder-gray-600 transition-all ${
                                    ensStatus === "resolved"
                                        ? "border-green-500/60 text-green-300 focus:ring-1 focus:ring-green-500"
                                        : ensStatus === "error"
                                        ? "border-red-500/60 text-red-300 focus:ring-1 focus:ring-red-500"
                                        : "border-white/10 text-white focus:ring-1 focus:ring-blue-500"
                                }`}
                                placeholder="alice.eth  —  or fill fields manually below"
                                value={ensInput}
                                onChange={e => handleEnsInput(e.target.value)}
                                id="ens-input"
                            />

                            {/* Status icon */}
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                                {ensStatus === "resolving" && (
                                    <span className="inline-block animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full" />
                                )}
                                {ensStatus === "resolved" && <span>✅</span>}
                                {ensStatus === "error" && <span>❌</span>}
                                {ensStatus === "idle" && ensInput === "" && (
                                    <span className="text-gray-600 text-sm">🔍</span>
                                )}
                            </span>
                        </div>

                        {/* ENS resolved badge */}
                        {ensStatus === "resolved" && ensResolved && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-green-400 bg-green-400/5 border border-green-400/20 rounded-lg px-3 py-2">
                                <span>🎯</span>
                                <span className="font-mono">Resolved: <span className="font-bold">{ensResolved.ensName}</span></span>
                                <span className="text-gray-500">→</span>
                                <span className="font-mono truncate text-green-300/70">{ensResolved.address.slice(0, 10)}...{ensResolved.address.slice(-6)}</span>
                                <button
                                    onClick={clearEns}
                                    className="ml-auto text-gray-500 hover:text-red-400 transition-colors"
                                    title="Clear ENS"
                                >✕</button>
                            </div>
                        )}

                        {/* ENS error badge */}
                        {ensStatus === "error" && (
                            <div className="mt-2 text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2 leading-relaxed">
                                ⚠️ {ensError}
                            </div>
                        )}
                    </div>

                    {/* ── Divider ── */}
                    <div className="flex items-center gap-3 py-1">
                        <div className="flex-1 h-px bg-white/5" />
                        <span className="text-[10px] text-gray-600 uppercase tracking-widest">
                            {ensResolved ? "auto-filled from ENS" : "or enter manually"}
                        </span>
                        <div className="flex-1 h-px bg-white/5" />
                    </div>

                    {/* ── Manual Key Fields (always visible, auto-filled by ENS) ── */}
                    <div className={`space-y-4 transition-opacity duration-300 ${ensResolved ? "opacity-60" : "opacity-100"}`}>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                Recipient Scan Public Key
                            </label>
                            <input
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                placeholder="0x04..."
                                value={scanPub}
                                onChange={e => { setScanPub(e.target.value); clearEns(); }}
                                readOnly={!!ensResolved}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                Recipient Spend Public Key
                            </label>
                            <input
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                placeholder="0x04..."
                                value={spendPub}
                                onChange={e => { setSpendPub(e.target.value); clearEns(); }}
                                readOnly={!!ensResolved}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                Recipient Identity Hash (Index Hash)
                            </label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-blue-300 placeholder-gray-600 transition-all"
                                placeholder="0x..."
                                value={recipientIndexHash}
                                onChange={e => { setRecipientIndexHash(e.target.value); clearEns(); }}
                                readOnly={!!ensResolved}
                            />
                        </div>
                    </div>

                    {/* ── Token Type & Amount ── */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                            Token Type
                        </label>
                        <select
                            className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white transition-all mb-5"
                            value={tokenType}
                            onChange={(e) => setTokenType(e.target.value)}
                        >
                            <option value="ETH">ETH</option>
                            <option value="ERC20">ERC-20</option>
                            <option value="ERC721">ERC-721 (NFT)</option>
                        </select>

                        {(tokenType === "ERC20" || tokenType === "ERC721") && (
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    Token Contract Address
                                </label>
                                <input
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                    placeholder="0x..."
                                    value={tokenAddress}
                                    onChange={e => setTokenAddress(e.target.value)}
                                />
                            </div>
                        )}

                        {tokenType === "ERC721" ? (
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    Token ID
                                </label>
                                <input
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                    placeholder="e.g. 42"
                                    value={tokenId}
                                    onChange={e => setTokenId(e.target.value)}
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    Transfer Amount
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-lg font-bold text-white placeholder-gray-600 transition-all pl-12"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Ξ</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Submit ── */}
                    <div className="pt-4">
                        <button
                            onClick={handleSend}
                            disabled={
                                isSending ||
                                !scanPub || !spendPub || !recipientIndexHash ||
                                (tokenType !== "ERC721" && !amount) ||
                                (tokenType !== "ETH" && !tokenAddress) ||
                                (tokenType === "ERC721" && !tokenId) ||
                                ensStatus === "resolving"
                            }
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/20 text-white font-bold tracking-wider uppercase rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-3 transform hover:scale-[1.01] active:scale-95"
                        >
                            {isSending ? (
                                <>
                                    <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                    {progress || "Broadcasting..."}
                                </>
                            ) : ensStatus === "resolving" ? (
                                <>
                                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                    Resolving ENS...
                                </>
                            ) : (
                                <>
                                    <span className="text-xl">🚀</span>
                                    {ensResolved ? `Send to ${ensResolved.ensName}` : "Broadcast Stealth Payment"}
                                </>
                            )}
                        </button>

                        {/* ENS tip */}
                        <p className="text-center text-[11px] text-gray-600 mt-3">
                            💡 Recipients can register their stealth keys on ENS for easy discovery
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}