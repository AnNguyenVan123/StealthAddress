import React from 'react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export default function AppShell({ 
  children, 
  activeTab, 
  setActiveTab, 
  meta, 
  handleLogout, 
  ensStatus, 
  ensNames 
}) {
  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-50 selection:bg-purple-500/30 flex w-full">
      
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        meta={meta} 
        handleLogout={handleLogout}
        ensStatus={ensStatus}
        ensNames={ensNames}
      />
      
      <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 relative">
        <div className="flex-1 overflow-y-auto w-full">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 md:py-10 w-full min-h-full flex flex-col">
            
            {/* Page Content */}
            <div className="flex-1">
              {children}
            </div>

            {/* Footer */}
            <div className="mt-16 pt-6 pb-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium border-t border-slate-800/50">
              <p>© {new Date().getFullYear()} Stealth Wallet. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <span className="px-2 py-1 bg-slate-800 rounded-md text-slate-400 border border-slate-700/50">ERC-5564</span>
                <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                <span className="flex items-center gap-1.5 px-2 py-1 bg-emerald-900/10 rounded-md text-emerald-500 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span> 
                  Relayer Online
                </span>
              </div>
            </div>

          </div>
        </div>
      </main>

      <BottomNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        meta={meta}
        ensStatus={ensStatus}
      />
      
    </div>
  );
}
