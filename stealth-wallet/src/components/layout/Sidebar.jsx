import React from 'react';
import { Icons, NAV_ITEMS } from './NavigationConfig';

export default function Sidebar({ activeTab, setActiveTab, meta, handleLogout, ensStatus, ensNames }) {
  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 glass-panel shrink-0 sticky top-0 h-screen">
      {/* Branding */}
      <div className="p-6 pb-2 border-b border-slate-800/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-900 text-lg font-orbitron font-bold shadow-[0_0_15px_rgba(245,158,11,0.4)]">
            S
          </div>
          <div>
            <h2 className="text-xl font-orbitron font-bold text-slate-50 tracking-tight">
              Stealth
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Sepolia Testnet</p>
            </div>
          </div>
        </div>

        {/* ENS Badges */}
        {ensStatus === "found" && ensNames?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ensNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-md text-[10px] font-medium text-purple-400"
              >
                <span className="text-purple-500/50">#</span>
                {name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-hide">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-3 ${
              activeTab === item.id
                ? "bg-slate-800 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)] border border-amber-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
            } ${item.bottomOffset ? 'mt-8' : ''}`}
          >
            <span className={activeTab === item.id ? "text-amber-500" : "text-slate-500"}>
              {Icons[item.icon]}
            </span>
            <span>{item.label}</span>
            {/* Notification dot */}
            {item.id === "ens" && meta && ensStatus === "none" && (
              <span className="absolute top-1/2 -translate-y-1/2 right-4 w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_5px_rgba(139,92,246,0.8)]" />
            )}
          </button>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-slate-800/50">
        {meta ? (
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-bold border border-red-500/20 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout Wallet
          </button>
        ) : (
          <div className="text-center px-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">No Wallet Loaded</p>
          </div>
        )}
      </div>
    </aside>
  );
}
