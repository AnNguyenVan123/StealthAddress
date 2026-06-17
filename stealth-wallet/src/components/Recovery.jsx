import React, { useState } from "react";
import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";
import { computeIndexHash } from "../stealth/zkIntegration";
import { socialRecoveryAbi, socialRecoveryBytecode } from "../abi/socialRecoveryAbi";
import { stealthAccountFactoryAbi } from "../abi/stealthAccountFactoryAbi";
import { formatError } from "../utils/errors";

const RPC_URL = import.meta.env.VITE_RPC_URL;
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS;
const SERVER_URL = import.meta.env.VITE_SERVER_URL !== undefined ? import.meta.env.VITE_SERVER_URL : "http://localhost:3001";

export default function Recovery({ meta }) {
    const [mode, setMode] = useState("setup"); // 'setup' | 'guardian'
    const [status, setStatus] = useState("");
    
    // Setup state
    const [guardiansStr, setGuardiansStr] = useState("");
    const [threshold, setThreshold] = useState("2");
    
    // Guardian state
    const [searchIndexHash, setSearchIndexHash] = useState("");
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
            setStatus(`❌ Error: ${formatError(error)}`);
        }
    };

    const fetchAddressByIndexHash = async (idxHash) => {
        try {
            if (!idxHash || !idxHash.startsWith("0x")) {
                setStatus("❌ Please enter a valid 0x-prefixed index hash.");
                return;
            }
            setStatus(`Searching for Recovery Contract by Index Hash...`);
            const provider = new ethers.BrowserProvider(window.ethereum);
            const factory = new ethers.Contract(FACTORY_ADDRESS, stealthAccountFactoryAbi, provider);
            const treeManagerAddress = await factory.treeManager();
            
            const imtAbi = [
                "function socialContractMap(uint32) view returns (address)",
                "function nextIndex() view returns (uint32)"
            ];
            const imt = new ethers.Contract(treeManagerAddress, imtAbi, provider);
            
            setStatus(`Fetching total leaves from contract to scan...`);
            const nextIndex = await imt.nextIndex();
            
            setStatus(`Scanning ${nextIndex} indices to match hash...`);
            let matchedIndex = -1;
            for (let i = 0; i < Number(nextIndex); i++) {
                const hash = await computeIndexHash(i);
                if (hash.toLowerCase() === idxHash.toLowerCase()) {
                    matchedIndex = i;
                    break;
                }
            }
            
            if (matchedIndex === -1) {
                setStatus(`❌ Could not find any index matching this hash.`);
                return;
            }
            
            setStatus(`Index matched: ${matchedIndex}. Fetching contract...`);
            const addr = await imt.socialContractMap(matchedIndex);
            
            if (addr === ethers.ZeroAddress) {
                setStatus(`❌ No Social Recovery contract found for this wallet.`);
            } else {
                setRecoveryAddress(addr);
                setStatus(`✅ Found Recovery Contract: ${addr}`);
            }
        } catch(e) {
            setStatus(`❌ Error: ${formatError(e)}`);
        }
    };

    const autoFetchAddress = async () => {
        if (!meta || !meta.indexHash) {
            setStatus("❌ No wallet loaded to fetch index from. Please enter the wallet index hash manually.");
            return;
        }
        await fetchAddressByIndexHash(meta.indexHash);
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
            setStatus(`❌ Error loading requests: ${formatError(e)}`);
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
            setStatus(`❌ Error: ${formatError(e)}`);
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
            setStatus(`❌ Error: ${formatError(e)}`);
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
            setStatus(`❌ Error: ${formatError(e)}`);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95">
            <div className="glass-panel border-purple-500/20 rounded-3xl p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
                
                <h2 className="text-2xl font-extrabold mb-8 text-slate-200 tracking-tight font-orbitron">Security Center</h2>
                
                <div className="flex bg-slate-900/50 p-1 rounded-xl mb-8 border border-slate-700 relative z-10 w-fit">
                    <button 
                        onClick={() => setMode("setup")} 
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === "setup" ? "bg-slate-800 text-amber-500 shadow-[0_0_10px_rgba(0,0,0,0.3)] border border-slate-600" : "text-slate-400 hover:text-slate-200"}`}
                    >
                        Setup Recovery
                    </button>
                    <button 
                        onClick={() => setMode("guardian")} 
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === "guardian" ? "bg-slate-800 text-amber-500 shadow-[0_0_10px_rgba(0,0,0,0.3)] border border-slate-600" : "text-slate-400 hover:text-slate-200"}`}
                    >
                        Guardian Portal
                    </button>
                </div>

                {mode === "setup" && (
                    <div className="space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 flex items-start gap-3">
                            <span className="text-purple-400 mt-0.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            </span>
                            <p className="text-sm text-purple-300 leading-relaxed">
                                Define highly trusted entities (cold wallets or close friends) as Guardians. 
                                They possess the power to rescue your Identity if you lose your private keys.
                            </p>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Guardian Addresses (comma separated)</label>
                            <textarea
                                value={guardiansStr}
                                onChange={(e) => setGuardiansStr(e.target.value)}
                                placeholder="0x12..., 0x34..."
                                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 transition-all min-h-[80px] resize-none shadow-[0_0_10px_rgba(0,0,0,0.3)]"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Threshold (Required votes)</label>
                            <input
                                type="number"
                                value={threshold}
                                onChange={(e) => setThreshold(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                            />
                        </div>
                        <div className="pt-2">
                            <button 
                                onClick={handleSetup}
                                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold tracking-widest font-orbitron rounded-xl transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] flex justify-center items-center"
                            >
                                Deploy & Link Social Recovery
                            </button>
                        </div>
                    </div>
                )}

                {mode === "guardian" && (
                    <div className="space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex flex-col md:flex-row gap-4 mb-4">
                            <div className="flex-1">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Lookup by Wallet Index Hash</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={searchIndexHash}
                                        onChange={(e) => setSearchIndexHash(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                    />
                                    <button 
                                        onClick={() => fetchAddressByIndexHash(searchIndexHash)}
                                        className="px-4 bg-purple-900/30 hover:bg-purple-900/50 text-purple-400 rounded-lg font-bold transition-colors border border-purple-500/30 text-xs shadow-sm whitespace-nowrap uppercase tracking-widest"
                                    >
                                        Find Contract
                                    </button>
                                </div>
                                {!meta && <p className="text-[10px] text-slate-500 mt-1.5">You can perform recovery even if you are not logged in.</p>}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Target Social Recovery Contract</label>
                            <div className="flex gap-2">
                                <input
                                    value={recoveryAddress}
                                    onChange={(e) => setRecoveryAddress(e.target.value)}
                                    placeholder="0x..."
                                    className="flex-1 px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all"
                                />
                                {meta && (
                                    <button 
                                        onClick={autoFetchAddress}
                                        className="px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg font-bold transition-colors border border-amber-500/30 text-xs shadow-sm uppercase tracking-widest"
                                        title="Auto-fetch from current loaded wallet"
                                    >
                                        Auto-Fetch
                                    </button>
                                )}
                                <button 
                                    onClick={loadRequests}
                                    className="px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold transition-colors border border-slate-600 shadow-sm text-xs uppercase tracking-widest"
                                >
                                    Load Data
                                </button>
                            </div>
                        </div>

                        <div className="p-6 border border-purple-500/20 rounded-2xl bg-purple-900/10 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
                            <h3 className="text-sm font-bold mb-4 text-slate-200 font-orbitron flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" className="text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                Propose Identity Override
                            </h3>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">New Spend Private Key for the Rescued Wallet</label>
                            <input
                                value={newSpendPriv}
                                onChange={(e) => setNewSpendPriv(e.target.value)}
                                placeholder="0x..."
                                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-200 placeholder-slate-600 shadow-[0_0_10px_rgba(0,0,0,0.3)] transition-all mb-4"
                            />
                            <button 
                                onClick={proposeRecovery}
                                disabled={!newSpendPriv || !recoveryAddress}
                                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold tracking-widest uppercase rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(245,158,11,0.3)] hover:shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                            >
                                Submit Proposal
                            </button>
                        </div>

                        <div>
                            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800 pb-2 mb-4">Active Rescues</h3>
                            {requests.length === 0 && <p className="text-slate-500 italic text-sm">No requests found on this contract.</p>}
                            
                            <div className="space-y-4">
                                {requests.map(req => (
                                    <div key={req.id} className={`p-5 rounded-2xl border ${req.executed ? "bg-slate-900/40 border-slate-800" : "glass-panel border-purple-500/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]"} transition-all`}>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-[10px] font-bold bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700 tracking-widest">REQ #{req.id}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Approvals:</span>
                                                <span className="text-base font-bold text-amber-500 font-orbitron drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]">{req.approvals}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="mb-5">
                                            <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1.5 font-bold">Proposed Leaf Override</span>
                                            <p className="text-xs font-mono text-slate-400 bg-slate-900/60 p-2.5 rounded-lg break-all border border-slate-800 shadow-inner">{req.newLeaf}</p>
                                        </div>
                                        
                                        {!req.executed ? (
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => approveRecovery(req.id)}
                                                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-widest rounded-lg border border-slate-600 transition-colors shadow-sm"
                                                >
                                                    Vote Yes
                                                </button>
                                                <button 
                                                    onClick={() => executeRecovery(req.id, req.newLeaf)}
                                                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors shadow-[0_0_10px_rgba(139,92,246,0.3)] hover:shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                                                >
                                                    Execute
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-emerald-400 font-bold text-[11px] tracking-widest uppercase">
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
                        <div className="glass-panel border border-slate-700 p-3.5 rounded-lg text-slate-300 text-xs font-mono break-all leading-relaxed shadow-[0_0_10px_rgba(0,0,0,0.3)]">
                            <span className="mr-2 text-purple-500 font-bold">❯</span>{status}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
