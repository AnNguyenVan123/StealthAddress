import { useState } from "react"
import Wallet from "./components/Wallet"
import Send from "./components/Send"
import Recovery from "./components/Recovery"

function App() {
  const [meta, setMeta] = useState(null)
  const [activeTab, setActiveTab] = useState("wallet") // wallet, transfer, recovery

  return (
    <div className="min-h-screen bg-[#0d0d12] text-white selection:bg-purple-500/30">
      {/* Animated subtle background blobs */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
          <h2 className="text-3xl font-extrabold tracking-widest bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent drop-shadow-md">
            STEALTH
          </h2>
          
          <div className="flex bg-white/5 p-1.5 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl">
            <button 
              onClick={() => setActiveTab("wallet")}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ease-out ${activeTab === "wallet" ? "bg-white/10 text-white shadow-lg scale-100" : "text-gray-400 hover:text-white hover:bg-white/5 scale-95"}`}>
                Dashboard
            </button>
            <button 
              onClick={() => setActiveTab("transfer")}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ease-out ${activeTab === "transfer" ? "bg-white/10 text-white shadow-lg scale-100" : "text-gray-400 hover:text-white hover:bg-white/5 scale-95"}`}>
                Transfer
            </button>
            <button 
              onClick={() => setActiveTab("recovery")}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ease-out ${activeTab === "recovery" ? "bg-white/10 text-white shadow-lg scale-100" : "text-gray-400 hover:text-white hover:bg-white/5 scale-95"}`}>
                Security Center
            </button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          {activeTab === "wallet" && (
            <Wallet meta={meta} setMeta={setMeta} />
          )}

          {activeTab === "transfer" && meta && (
            <Send meta={meta} />
          )}
          
          {activeTab === "transfer" && !meta && (
            <div className="flex flex-col items-center justify-center p-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
              <div className="w-16 h-16 mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <span className="text-2xl">🔒</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Wallet Locked</h3>
              <p className="text-gray-400 text-center max-w-sm">Please initialize or import your stealth wallet bundle in the Dashboard first.</p>
            </div>
          )}

          {activeTab === "recovery" && (
            <Recovery meta={meta} />
          )}
        </div>
      </div>
    </div>
  )
}

export default App