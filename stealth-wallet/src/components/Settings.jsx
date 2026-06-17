import React, { useState } from 'react';

export default function Settings({ meta, handleLogout }) {
  const [showKeys, setShowKeys] = useState(false);

  const wipeWallet = () => {
    if (window.confirm("Are you sure? This will remove your stealth wallet from this browser. Make sure you have your keys backed up!")) {
      handleLogout();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in zoom-in-95">
      <h2 className="text-2xl font-extrabold mb-8 text-slate-200 tracking-tight font-orbitron">Wallet Settings</h2>

      <div className="space-y-6">
        {/* Backup Keys Section */}
        {meta && (
          <div className="glass-panel border-purple-500/20 rounded-2xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
            <h3 className="text-lg font-bold text-slate-200 mb-4 font-orbitron flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" className="text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              Backup & Recovery
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Your stealth meta-address bundle contains the keys required to detect and spend funds. Keep this safe.
            </p>
            
            <div className="relative">
              <textarea 
                readOnly
                value={showKeys ? JSON.stringify(meta, null, 2) : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                className={`w-full h-32 p-4 bg-slate-900/60 border ${showKeys ? 'border-amber-500/50 text-amber-500' : 'border-slate-700 text-slate-500'} rounded-xl font-mono text-xs outline-none resize-none transition-all`}
              />
              {!showKeys && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm rounded-xl">
                  <button 
                    onClick={() => setShowKeys(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold rounded-lg border border-slate-600 transition-all shadow-sm flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    Reveal Keys
                  </button>
                </div>
              )}
            </div>
            
            {showKeys && (
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(meta, null, 2));
                    alert("Copied to clipboard!");
                    setShowKeys(false);
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                >
                  Copy to Clipboard
                </button>
              </div>
            )}
          </div>
        )}

        {/* Network & Infrastructure */}
        <div className="glass-panel border-slate-700 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-200 mb-4 font-orbitron flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" className="text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            Infrastructure
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Network</label>
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)] animate-pulse"></span>
                <span className="text-sm font-medium text-slate-300">Ethereum Sepolia Testnet</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Relayer URL</label>
              <div className="px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl">
                <span className="text-sm font-mono text-slate-400">{import.meta.env.VITE_SERVER_URL || "http://localhost:3001"}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">RPC Endpoint</label>
              <div className="px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden text-ellipsis">
                <span className="text-sm font-mono text-slate-500">Provided by Environment Config</span>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        {meta && (
          <div className="border border-red-500/30 bg-red-900/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-red-500 mb-2 font-orbitron">Danger Zone</h3>
            <p className="text-sm text-red-400/80 mb-4">
              Wiping your wallet will remove your local keys. You will lose access to your funds if you haven't backed up the bundle above.
            </p>
            <button 
              onClick={wipeWallet}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-bold uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Wipe Local Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
