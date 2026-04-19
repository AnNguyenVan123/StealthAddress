import toast, { Toaster } from "react-hot-toast";
import { useSend } from "../hooks/useSend";

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
                {/* Decorative background element */}
                <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-blue-500/20 rounded-full blur-[60px]" />
                
                <h3 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Direct External Transfer</h3>
                <p className="text-sm text-gray-400 mb-8 max-w-sm">
                    Fund a recipient's Stealth Abstract Account directly from your MetaMask holding account.
                </p>

                <div className="space-y-5 relative z-10">
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                            Recipient Scan Public Key
                        </label>
                        <input
                            className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                            placeholder="0x04..."
                            value={scanPub}
                            onChange={e => setScanPub(e.target.value)}
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
                            onChange={e => setSpendPub(e.target.value)}
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
                            onChange={e => setRecipientIndexHash(e.target.value)}
                        />
                    </div>

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
                                    Token Address
                                </label>
                                <input
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                    placeholder="0x..."
                                    value={tokenAddress}
                                    onChange={e => setTokenAddress(e.target.value)}
                                />
                            </div>
                        )}
                        {tokenType === "ERC721" && (
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    Token ID
                                </label>
                                <input
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                    placeholder="e.g. 1"
                                    value={tokenId}
                                    onChange={e => setTokenId(e.target.value)}
                                />
                            </div>
                        )}
                        {tokenType !== "ERC721" && (
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

                    <div className="pt-4">
                        <button
                            onClick={handleSend}
                            disabled={isSending || !scanPub || !spendPub || !recipientIndexHash || (tokenType !== 'ERC721' && !amount) || (tokenType !== 'ETH' && !tokenAddress) || (tokenType === 'ERC721' && !tokenId)}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/20 text-white font-bold tracking-wider uppercase rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-3 transform hover:scale-[1.01] active:scale-95"
                        >
                            {isSending ? (
                                <>
                                    <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                    {progress || "Broadcasting..."}
                                </>
                            ) : (
                                <>
                                    <span className="text-xl">🚀</span> Broadcast Stealth Payment
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}