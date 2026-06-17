import { useState } from "react"
import Wallet from "./components/Wallet"
import Send from "./components/Send"
import Recovery from "./components/Recovery"
import EnsRegister from "./components/EnsRegister"
import Activity from "./components/Activity"
import Settings from "./components/Settings"
import AppShell from "./components/layout/AppShell"
import { useEnsLookup } from "./hooks/useEnsLookup"
import { useStealthWallet } from "./hooks/useStealthWallet"
import { Icons } from "./components/layout/NavigationConfig"

function App() {
  const [meta, setMetaState] = useState(() => {
    const saved = localStorage.getItem("stealth_meta")
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        return null
      }
    }
    return null
  })

  const setMeta = (newMeta) => {
    setMetaState(newMeta)
    if (newMeta) {
      localStorage.setItem("stealth_meta", JSON.stringify(newMeta))
    } else {
      localStorage.removeItem("stealth_meta")
    }
  }

  const handleLogout = () => {
    setMeta(null)
    setActiveTab("wallet")
  }

  const [activeTab, setActiveTab] = useState("wallet")

  const { ensName, ensNames, ensStatus } = useEnsLookup(meta)
  const stealthState = useStealthWallet(meta, setMeta)

  return (
    <AppShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      meta={meta}
      handleLogout={handleLogout}
      ensStatus={ensStatus}
      ensNames={ensNames}
    >
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out h-full">
        {activeTab === "wallet" && (
          <Wallet meta={meta} setMeta={setMeta} stealthState={stealthState} />
        )}

        {activeTab === "transfer" && meta && (
          <Send meta={meta} stealthState={stealthState} />
        )}

        {activeTab === "transfer" && !meta && (
          <div className="flex flex-col items-center justify-center p-12 glass-panel border-purple-500/20 rounded-3xl text-center shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <div className="w-20 h-20 mb-6 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 shadow-inner">
              {Icons.lock}
            </div>
            <h3 className="text-xl font-bold text-slate-200 mb-3 font-orbitron">Wallet Locked</h3>
            <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
              Please initialize or import your stealth wallet bundle in the Dashboard first to access transfers.
            </p>
            <button
              onClick={() => setActiveTab("wallet")}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-orbitron tracking-widest uppercase rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {activeTab === "activity" && (
          <Activity />
        )}

        {activeTab === "recovery" && (
          <Recovery meta={meta} />
        )}

        {activeTab === "settings" && (
          <Settings meta={meta} handleLogout={handleLogout} />
        )}

        {activeTab === "ens" && (
          <div className="space-y-6 w-full max-w-xl mx-auto">
            {ensStatus === "loading" && (
              <div className="flex items-center gap-3 px-5 py-4 glass-panel border-purple-500/20 rounded-xl animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.1)]">
                <span className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-purple-400 font-medium">Looking up your ENS names on Sepolia…</p>
              </div>
            )}
            {ensStatus === "found" && ensNames.length > 0 && (
              <div className="glass-panel border-emerald-500/30 rounded-2xl p-6 animate-in fade-in duration-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-10 h-10 rounded-full bg-emerald-900/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                    {Icons.globe}
                  </div>
                  <div>
                    <h3 className="text-base font-orbitron font-bold text-slate-200">ENS Registered ({ensNames.length})</h3>
                    <p className="text-xs text-slate-400 mt-1">Your stealth keys are publicly linked. Senders can find you by name.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ensNames.map((name) => (
                    <div
                      key={name}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border border-emerald-500/20 rounded-lg text-sm font-medium text-slate-300 shadow-sm"
                    >
                      <span className="text-emerald-500 font-mono text-xs">#</span>
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ensStatus === "none" && meta && (
              <div className="flex items-start gap-4 px-6 py-5 bg-purple-900/10 border border-purple-500/30 rounded-2xl shadow-[0_0_15px_rgba(139,92,246,0.1)]">
                <span className="text-purple-400 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </span>
                <div>
                  <h3 className="text-sm font-bold text-purple-200 font-orbitron mb-1">No ENS Registered</h3>
                  <p className="text-xs text-purple-300/70 leading-relaxed">Register your domain below to make it easy for senders to find you without sharing long meta-addresses.</p>
                </div>
              </div>
            )}
            <EnsRegister meta={meta} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default App;