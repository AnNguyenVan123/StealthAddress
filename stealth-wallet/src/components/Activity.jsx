import React, { useState, useEffect } from 'react';

export default function Activity() {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    // Load local history
    const history = localStorage.getItem("stealth_activity");
    if (history) {
      try {
        setActivities(JSON.parse(history).reverse()); // newest first
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const clearHistory = () => {
    if (window.confirm("Clear all local activity history?")) {
      localStorage.removeItem("stealth_activity");
      setActivities([]);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in zoom-in-95">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-200 tracking-tight font-orbitron mb-2">Activity Log</h2>
          <p className="text-sm text-slate-400">Your recent outgoing stealth transfers.</p>
        </div>
        {activities.length > 0 && (
          <button 
            onClick={clearHistory}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
          >
            Clear History
          </button>
        )}
      </div>

      <div className="glass-panel border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
        {activities.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-300 font-orbitron mb-2">No Recent Activity</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Outgoing transfers made from this browser will appear here. Note that stealth transactions are not linkable on-chain.
            </p>
          </div>
        ) : (
          <div className="space-y-4 relative">
            {/* Connecting line for timeline effect */}
            <div className="absolute left-6 top-4 bottom-4 w-px bg-slate-800 hidden sm:block"></div>
            
            {activities.map((tx, idx) => (
              <div key={idx} className="relative flex flex-col sm:flex-row gap-4 sm:gap-6 sm:items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-800 hover:border-purple-500/30 transition-colors group">
                <div className="hidden sm:flex w-12 h-12 rounded-full bg-purple-900/30 border border-purple-500/30 items-center justify-center text-purple-400 z-10 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
                
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-bold text-slate-200">Sent {tx.amount} {tx.tokenSymbol || 'ETH'}</h4>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">{new Date(tx.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-16 text-slate-500 uppercase font-bold tracking-widest text-[9px]">To:</span>
                      <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-slate-300 truncate max-w-[200px] sm:max-w-xs">{tx.recipient}</span>
                    </div>
                    {tx.txHash && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="w-16 text-slate-500 uppercase font-bold tracking-widest text-[9px]">Tx Hash:</span>
                        <a href={`https://sepolia.etherscan.io/tx/${tx.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-purple-400 hover:text-purple-300 hover:underline truncate max-w-[200px] sm:max-w-xs">
                          {tx.txHash}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
