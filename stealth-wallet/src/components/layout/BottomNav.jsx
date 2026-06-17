import React from 'react';
import { Icons, NAV_ITEMS } from './NavigationConfig';

export default function BottomNav({ activeTab, setActiveTab, meta, ensStatus }) {
  // Mobile nav shows maximum 5 items to not clutter
  const mobileNavItems = NAV_ITEMS.filter(item => item.id !== 'settings');

  return (
    <>
      {/* Mobile Top Header (Mobile Only) */}
      <div className="md:hidden sticky top-0 z-40 glass-panel border-b border-slate-800/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-900 text-sm font-orbitron font-bold shadow-[0_0_10px_rgba(245,158,11,0.4)]">
            S
          </div>
          <h2 className="text-lg font-orbitron font-bold text-slate-50 tracking-tight">Stealth</h2>
        </div>
        <button 
          onClick={() => setActiveTab('settings')}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800"
        >
          {Icons.settings}
        </button>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-slate-800 pb-safe">
        <div className="flex items-center justify-around px-2 py-2">
          {mobileNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center w-full py-1.5 transition-all ${
                activeTab === item.id ? "text-amber-500" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className={`mb-1 transition-transform ${activeTab === item.id ? "scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" : ""}`}>
                {Icons[item.icon]}
              </div>
              <span className={`text-[10px] font-medium tracking-wide ${activeTab === item.id ? "font-bold" : ""}`}>
                {item.label}
              </span>
              
              {/* Notification dot */}
              {item.id === "ens" && meta && ensStatus === "none" && (
                <span className="absolute top-1 right-1/4 w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_5px_rgba(139,92,246,0.8)]" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
