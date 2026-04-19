import React, { useState } from "react";
import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";
import { socialRecoveryAbi, socialRecoveryBytecode } from "../abi/socialRecoveryAbi";
import { stealthAccountFactoryAbi } from "../abi/stealthAccountFactoryAbi";

const RPC_URL = import.meta.env.VITE_RPC_URL;
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS;
const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export default function Recovery({ meta }) {
    const [mode, setMode] = useState("setup"); // 'setup' | 'guardian'
    const [status, setStatus] = useState("");
    
    // Setup state
    const [guardiansStr, setGuardiansStr] = useState("");
    const [threshold, setThreshold] = useState("2");
    
    // Guardian state
    const [recoveryAddress, setRecoveryAddress] = useState("");
    const [newSpendPriv, setNewSpendPriv] = useState("");
    const [requests, setRequests] = useState([]);

    const handleSetup = async () => {
        if (!meta) {
            setStatus("Please load your wallet first to configure recovery.");
            return;
        }
        if (meta.index === undefined || meta.index === null) {
            setStatus("❌ Your wallet has no Merkle index yet. Please scan or import your wallet first.");
            return;
        }
        if (!FACTORY_ADDRESS) {
            setStatus("❌ VITE_FACTORY_ADDRESS is not set in .env — please deploy the contracts first.");
            return;
        }
        
        try {
            setStatus("Connecting to MetaMask...");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // 1. Fetch treeManager from Factory
            const factory = new ethers.Contract(FACTORY_ADDRESS, stealthAccountFactoryAbi, provider);
            const treeManagerAddress = await factory.treeManager();
            
            // 2. Parse Guardians
            const guardians = guardiansStr.split(",").map(g => g.trim());
            if (guardians.length === 0 || !guardians[0]) throw new Error("Need at least 1 guardian");
            
            setStatus("Deploying Social Recovery Contract...");
            const SocialRecoveryFactory = new ethers.ContractFactory(socialRecoveryAbi, socialRecoveryBytecode, signer);
            const contract = await SocialRecoveryFactory.deploy(
                treeManagerAddress,
                meta.index, // The user's published index
                guardians,
                threshold
            );
            await contract.waitForDeployment();
            const deployedAddr = await contract.getAddress();
            
            setStatus(`Deployed at ${deployedAddr}! Please link it to the Merkle Tree...`);
            
            // 3. Register onto TreeManager (Needs the IMT ABI)
            const imtAbi = [
                "function registerSocialContract(uint32 index, address socialContract) external"
            ];
            const imt = new ethers.Contract(treeManagerAddress, imtAbi, signer);
            
            const tx = await imt.registerSocialContract(meta.index, deployedAddr);
            setStatus(`Waiting for tx ${tx.hash}...`);
            await tx.wait();
            
            setStatus(`✅ Recovery Setup Complete! Contract: ${deployedAddr}`);
            
        } catch (error) {
            console.error(error);
            setStatus(`❌ Error: ${error.message}`);
        }
    };

    const autoFetchAddress = async () => {
        if (!meta || meta.index === undefined || meta.index === null) {
            setStatus("❌ No wallet loaded to fetch index from.");
            return;
        }
        try {
            setStatus("Fetching Recovery Contract for current wallet...");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const factory = new ethers.Contract(FACTORY_ADDRESS, stealthAccountFactoryAbi, provider);
            const treeManagerAddress = await factory.treeManager();
            
            const imtAbi = ["function socialContractMap(uint32) view returns (address)"];
            const imt = new ethers.Contract(treeManagerAddress, imtAbi, provider);
            const addr = await imt.socialContractMap(meta.index);
            
            if (addr === ethers.ZeroAddress) {
                setStatus("❌ No Social Recovery contract found for this wallet's index.");
            } else {
                setRecoveryAddress(addr);
                setStatus(`✅ Found Recovery Contract: ${addr}`);
            }
        } catch(e) {
            setStatus(`❌ Error: ${e.message}`);
        }
    };
    
    const loadRequests = async () => {
        if (!recoveryAddress) return;
        try {
            setStatus("Loading requests...");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(recoveryAddress, socialRecoveryAbi, provider);
            
            const reqCount = await contract.requestCount();
            const reqs = [];
            for (let i = 0; i < Number(reqCount); i++) {
                const req = await contract.requests(i);
                reqs.push({
                    id: i,
                    newRoot: req.newRoot,
                    newLeaf: req.newLeaf,
                    approvals: Number(req.approvals),
                    executed: req.executed
                });
            }
            setRequests(reqs);
            setStatus("");
        } catch(e) {
            setStatus(`Error loading requests: ${e.message}`);
        }
    };
    
    const proposeRecovery = async () => {
        try {
            setStatus("Preparing recovery proposal...");
            if (!newSpendPriv) throw new Error("Enter a new spend private key");
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(recoveryAddress, socialRecoveryAbi, signer);
            
            // 1. Get mapped index
            const index = await contract.mappedIndex();
            
            // 2. Hash new key: k = poseidon(newSpendPriv)
            const poseidon = await buildPoseidon();
            const F = poseidon.F;
            const kField = poseidon([F.e(BigInt(newSpendPriv))]);
            const newLeafHex = "0x" + F.toObject(kField).toString(16).padStart(64, '0');
            
            // 3. Ask server for recovery proof & new root
            setStatus("Fetching ZK proof for tree update from server...");
            const res = await fetch(`${SERVER_URL}/leaves/recovery-proof`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ index: Number(index), newLeaf: newLeafHex })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            const newRoot = data.newRoot;
            
            // 4. Propose on chain
            setStatus("Confirming proposal transaction...");
            const tx = await contract.proposeRecovery(newRoot, newLeafHex);
            await tx.wait();
            
            setStatus("✅ Proposal submitted successfully!");
            loadRequests();
            
        } catch (e) {
            console.error(e);
            setStatus(`❌ Error: ${e.message}`);
        }
    };
    
    const approveRecovery = async (reqId) => {
        try {
            setStatus("Approving...");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(recoveryAddress, socialRecoveryAbi, signer);
            const tx = await contract.approveRecovery(reqId);
            await tx.wait();
            setStatus("✅ Approved!");
            loadRequests();
        } catch(e) {
            setStatus(`❌ Error: ${e.message}`);
        }
    };
    
    const executeRecovery = async (reqId, newLeaf) => {
        try {
            setStatus("Executing Recovery...");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(recoveryAddress, socialRecoveryAbi, signer);
            
            const index = await contract.mappedIndex();
            
            // Need ZK Proof from server to execute
            setStatus("Re-generating ZK proof for execution...");
            const res = await fetch(`${SERVER_URL}/leaves/recovery-proof`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ index: Number(index), newLeaf })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            setStatus("Confirming execution tx...");
            const tx = await contract.executeRecovery(reqId, data.auth);
            await tx.wait();
            
            // Sync server tree
            setStatus("Syncing with server...");
            await fetch(`${SERVER_URL}/leaves/sync-recovery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ index: Number(index), newLeaf })
            });
            
            setStatus("✅ Recovery Executed! Wallet ownership updated.");
            loadRequests();
            
        } catch(e) {
            setStatus(`❌ Error: ${e.message}`);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-purple-500/20 rounded-full blur-[80px]" />
                
                <h2 className="text-3xl font-extrabold mb-8 bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">Security Center</h2>
                
                <div className="flex bg-black/40 p-1 rounded-xl mb-8 border border-white/5 relative z-10 w-fit">
                    <button 
                        onClick={() => setMode("setup")} 
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${mode === "setup" ? "bg-white/10 text-white shadow-lg shadow-black/50" : "text-gray-500 hover:text-white"}`}
                    >
                        Setup Recovery
                    </button>
                    <button 
                        onClick={() => setMode("guardian")} 
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${mode === "guardian" ? "bg-white/10 text-white shadow-lg shadow-black/50" : "text-gray-500 hover:text-white"}`}
                    >
                        Guardian Portal
                    </button>
                </div>

                {mode === "setup" && (
                    <div className="space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                            <p className="text-sm text-blue-200">
                                Define highly trusted entities (cold wallets or close friends) as Guardians. 
                                They possess the power to rescue your Identity if you lose your private keys.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Guardian Addresses (comma separated)</label>
                            <textarea
                                value={guardiansStr}
                                onChange={(e) => setGuardiansStr(e.target.value)}
                                placeholder="0x12..., 0x34..."
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all min-h-[80px] resize-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Threshold (Required votes)</label>
                            <input
                                type="number"
                                value={threshold}
                                onChange={(e) => setThreshold(e.target.value)}
                                className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-purple-500 outline-none text-sm font-mono text-white transition-all"
                            />
                        </div>
                        <div className="pt-2">
                            <button 
                                onClick={handleSetup}
                                className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/20 text-white font-bold tracking-wider uppercase rounded-xl transition-all transform hover:scale-[1.01] active:scale-95"
                            >
                                Deploy & Link Social Recovery
                            </button>
                        </div>
                    </div>
                )}

                {mode === "guardian" && (
                    <div className="space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Target Social Recovery Contract</label>
                            <div className="flex gap-3">
                                <input
                                    value={recoveryAddress}
                                    onChange={(e) => setRecoveryAddress(e.target.value)}
                                    placeholder="0x..."
                                    className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all"
                                />
                                <button 
                                    onClick={autoFetchAddress}
                                    className="px-4 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-xl font-medium transition-colors border border-purple-500/30 text-xs"
                                    title="Auto-fetch from current loaded wallet"
                                >
                                    Auto-Fetch
                                </button>
                                <button 
                                    onClick={loadRequests}
                                    className="px-6 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors border border-white/5"
                                >
                                    Load Data
                                </button>
                            </div>
                        </div>

                        <div className="p-6 border border-purple-500/30 rounded-2xl bg-purple-900/10 backdrop-blur-sm">
                            <h3 className="text-lg font-bold mb-4 text-purple-300">Propose Identity Override</h3>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">New Spend Private Key for the Rescued Wallet</label>
                            <input
                                value={newSpendPriv}
                                onChange={(e) => setNewSpendPriv(e.target.value)}
                                placeholder="0x..."
                                className="w-full px-4 py-3 bg-black/60 border border-purple-500/20 rounded-xl focus:ring-1 focus:ring-purple-500 outline-none text-sm font-mono text-white placeholder-gray-600 transition-all mb-4"
                            />
                            <button 
                                onClick={proposeRecovery}
                                disabled={!newSpendPriv || !recoveryAddress}
                                className="w-full py-3 bg-purple-600/80 hover:bg-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-purple-400/30"
                            >
                                Submit Proposal
                            </button>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400 border-b border-white/10 pb-2 mb-4">Active Rescues</h3>
                            {requests.length === 0 && <p className="text-gray-500 italic text-sm">No requests found on this contract.</p>}
                            
                            <div className="space-y-4">
                                {requests.map(req => (
                                    <div key={req.id} className={`p-5 rounded-2xl border ${req.executed ? "bg-black/20 border-white/5" : "bg-white/5 border-blue-500/30"} transition-all`}>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-bold bg-white/10 px-2 py-1 rounded text-gray-300">REQ #{req.id}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400 uppercase tracking-wider">Approvals:</span>
                                                <span className="text-lg font-bold text-white">{req.approvals}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="mb-5">
                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Proposed Leaf Override</span>
                                            <p className="text-xs font-mono text-gray-300 bg-black/40 p-2 rounded-lg break-all border border-white/5">{req.newLeaf}</p>
                                        </div>
                                        
                                        {!req.executed ? (
                                            <div className="flex gap-3">
                                                <button 
                                                    onClick={() => approveRecovery(req.id)}
                                                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-bold uppercase tracking-wider rounded-xl border border-white/10 transition-colors"
                                                >
                                                    Vote Yes
                                                </button>
                                                <button 
                                                    onClick={() => executeRecovery(req.id, req.newLeaf)}
                                                    className="flex-1 py-2.5 bg-blue-600/80 hover:bg-blue-500 text-white text-sm font-bold uppercase tracking-wider rounded-xl transition-colors border border-blue-400/30"
                                                >
                                                    Execute
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 font-bold text-sm tracking-widest uppercase">
                                                Executed
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {status && (
                    <div className="mt-8 relative z-10 animate-in fade-in">
                        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-blue-200 text-sm font-mono break-all leading-relaxed shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                            <span className="mr-2">❯</span>{status}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
