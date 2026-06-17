import { useRef } from "react";
import { ethers } from "ethers";
import { useEnsRegistration } from "../hooks/useEnsRegistration";

// Maps progress phase to step index
const STEPS = ["commit", "commit-tx", "wait", "register", "records", "done"];

function StepDot({ active, done, label }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all duration-300 ${
                done  ? "bg-emerald-500 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                active? "bg-amber-500 border-amber-400 text-slate-900 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" :
                        "bg-transparent border-slate-700 text-slate-500"
            }`}>
                {done ? "✓" : ""}
            </div>
            <span className="text-[9px] text-slate-500 uppercase tracking-widest whitespace-nowrap font-bold mt-1">{label}</span>
        </div>
    );
}

function ProgressBar({ phase }) {
    const stepIndex = STEPS.indexOf(phase);
    const steps = [
        { key: "commit",    label: "Commit" },
        { key: "commit-tx", label: "Tx 1" },
        { key: "wait",      label: "Wait" },
        { key: "register",  label: "Tx 2" },
        { key: "records",   label: "Tx 3" },
        { key: "done",      label: "Done" },
    ];
    return (
        <div className="flex items-start justify-center gap-1 py-3 w-full">
            {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1 flex-1">
                    <StepDot
                        active={STEPS[stepIndex] === s.key}
                        done={stepIndex > i || phase === "done"}
                        label={s.label}
                    />
                    {i < steps.length - 1 && (
                        <div className={`flex-1 h-px mt-[-16px] transition-colors ${stepIndex > i ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" : "bg-slate-800"}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

export default function EnsRegister({ meta }) {
    const debounceRef = useRef(null);
    const {
        name, setName,
        normaliseName,
        phase,
        progress,
        progressPhase,
        rentPrice,
        registeredName,
        error,
        timeRemaining,
        pendingReg,
        checkName,
        startCommit,
        completeRegister,
        cancelPending,
        reset,
    } = useEnsRegistration(meta);

    function handleNameChange(e) {
        const val = e.target.value;
        setName(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => checkName(val), 700);
    }

    const normName   = normaliseName(name);
    const isCommitting = phase === "committing";
    const isRegistering = phase === "registering";
    const canRegister   = phase === "available" && normName.length >= 3;

    return (
        <div className="w-full max-w-xl mx-auto animate-in fade-in zoom-in-95">
            <div className="glass-panel border-purple-500/20 rounded-3xl p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">

                {/* ── Header ── */}
                <div className="relative z-10">
                    <h3 className="text-2xl font-extrabold mb-2 text-slate-200 tracking-tight font-orbitron">
                        Register Your Stealth ENS
                    </h3>
                    <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                        Get a <span className="font-mono font-medium text-slate-300">.eth</span> domain linked to your stealth keys.
                        Senders can then use <span className="font-mono font-medium text-purple-400">yourname.eth</span> instead of raw public keys.
                    </p>

                    {/* ── Done state ── */}
                    {phase === "done" && registeredName && (
                        <div className="flex flex-col items-center gap-4 py-8 bg-emerald-900/10 border border-emerald-500/30 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                            <div className="text-6xl animate-bounce">🎉</div>
                            <h4 className="text-xl font-bold text-emerald-400 font-orbitron">Registration Complete!</h4>
                            <div className="font-mono text-xl bg-slate-900/50 border border-emerald-500/50 rounded-xl px-6 py-3 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] font-bold">
                                {registeredName}
                            </div>
                            <p className="text-sm text-slate-400 text-center max-w-sm">
                                Your stealth keys are now publicly linked to this domain.
                                Senders can find you by typing <span className="text-emerald-400 font-mono font-medium">{registeredName}</span> in the Transfer page.
                            </p>
                            <button
                                onClick={reset}
                                className="mt-4 px-6 py-2.5 text-sm text-slate-900 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] font-bold font-orbitron tracking-widest uppercase"
                            >
                                Register Another
                            </button>
                        </div>
                    )}

                    {/* ── Main form ── */}
                    {phase !== "done" && (
                        <div className="space-y-6">
                            {/* Name input */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Choose Your Name
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        className={`flex-1 px-4 py-3 pr-20 bg-slate-900/50 border rounded-xl outline-none text-lg font-mono text-slate-200 placeholder-slate-600 transition-all shadow-[0_0_10px_rgba(0,0,0,0.3)] ${
                                            phase === "available" ? "border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" :
                                            phase === "taken"     ? "border-red-500/50 focus:ring-2 focus:ring-red-500/20" :
                                            phase === "checking"  ? "border-purple-500/50 focus:ring-2 focus:ring-purple-500/20" :
                                                                     "border-slate-700 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                        }`}
                                        placeholder="yourname"
                                        value={name}
                                        onChange={handleNameChange}
                                        disabled={isCommitting || isRegistering || phase === "waiting"}
                                        maxLength={32}
                                        id="ens-name-input"
                                    />
                                    <span className="absolute right-4 text-slate-400 font-mono text-sm font-bold pointer-events-none">.eth</span>
                                </div>

                                {/* Availability status */}
                                <div className="h-6 mt-2">
                                    {phase === "checking" && (
                                        <p className="text-xs text-purple-400 flex items-center gap-1.5 font-medium">
                                            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-purple-500 border-t-transparent rounded-full" />
                                            Checking availability...
                                        </p>
                                    )}
                                    {phase === "available" && (
                                        <p className="text-xs text-emerald-400 font-medium">
                                            ✅ <span className="font-mono font-bold">{normName}.eth</span> is available!
                                            {rentPrice !== null && (
                                                <span className="ml-2 text-slate-500 font-normal">
                                                    ~{parseFloat(ethers.formatEther(rentPrice)).toFixed(5)} ETH/year
                                                </span>
                                            )}
                                        </p>
                                    )}
                                    {phase === "taken" && (
                                        <p className="text-xs text-red-400 font-medium">
                                            ❌ <span className="font-mono font-bold">{normName}.eth</span> is already taken.
                                        </p>
                                    )}
                                    {phase === "waiting" && (
                                        <p className="text-xs text-amber-400 font-medium animate-pulse">
                                            ⏳ Commitment submitted for <span className="font-mono font-bold">{normName}.eth</span>.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Requirements */}
                            {!meta?.scanPub && (
                                <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-400 font-medium">
                                    ⚠️ Please create or import your stealth wallet in the Dashboard first.
                                </div>
                            )}

                            {/* Progress section (during commit or register) */}
                            {(isCommitting || isRegistering || phase === "waiting") && (
                                <div className="glass-panel border-purple-500/20 rounded-2xl p-5 shadow-[0_0_15px_rgba(139,92,246,0.1)] transition-all duration-300">
                                    <ProgressBar phase={progressPhase} />
                                    <div className="text-center mt-3">
                                        <p className="text-sm text-purple-400 font-bold mb-1">{progress || (phase === "waiting" ? "Waiting for 60 seconds..." : "")}</p>
                                        <p className="text-xs text-slate-500 font-medium">
                                            {phase === "waiting" 
                                                ? "ENS requires a 60s wait between commit and register to prevent frontrunning."
                                                : "Please approve transactions in MetaMask and wait."}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {phase === "error" && error && (
                                <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-400 font-medium leading-relaxed">
                                    ❌ {error}
                                </div>
                            )}

                            {/* What will be registered info box */}
                            {canRegister && meta?.scanPub && !isCommitting && phase !== "waiting" && !isRegistering && (
                                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 space-y-1.5 shadow-inner">
                                    <p className="text-amber-500 font-bold mb-2">📦 To be registered on-chain:</p>
                                    <div className="grid grid-cols-1 gap-1 pl-1">
                                        <p className="flex justify-between items-center"><span className="text-slate-500">scanPub:</span> <span className="font-mono font-medium text-slate-300">{shortenAddress(meta?.scanPub)}</span></p>
                                        <p className="flex justify-between items-center"><span className="text-slate-500">spendPub:</span> <span className="font-mono font-medium text-slate-300">{shortenAddress(meta?.spendPub)}</span></p>
                                        <p className="flex justify-between items-center"><span className="text-slate-500">indexHash:</span> <span className="font-mono font-medium text-slate-300">{shortenAddress(meta?.indexHash)}</span></p>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-4 space-y-3">
                                {phase === "waiting" || pendingReg ? (
                                    <>
                                        <button
                                            onClick={completeRegister}
                                            disabled={timeRemaining > 0 || isRegistering}
                                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-slate-900 text-sm font-bold tracking-widest font-orbitron uppercase rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                                        >
                                            {isRegistering ? (
                                                <>
                                                    <span className="animate-spin h-4 w-4 border-2 border-slate-900/40 border-t-slate-900 rounded-full" />
                                                    Registering...
                                                </>
                                            ) : timeRemaining > 0 ? (
                                                `Wait ${timeRemaining}s to Register`
                                            ) : (
                                                `Complete Registration`
                                            )}
                                        </button>
                                        {!isRegistering && (
                                            <button
                                                onClick={cancelPending}
                                                className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest"
                                            >
                                                Cancel and start over
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={startCommit}
                                            disabled={!canRegister || isCommitting || !meta?.scanPub}
                                            className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/50 disabled:text-slate-500 text-white text-sm font-bold tracking-widest font-orbitron uppercase rounded-xl transition-all disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]"
                                        >
                                            {isCommitting ? (
                                                <>
                                                    <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                                                    Requesting...
                                                </>
                                            ) : (
                                                <>
                                                    Request to Register {normName ? `${normName}.eth` : ""}
                                                </>
                                            )}
                                        </button>

                                        <p className="text-center text-[11px] text-slate-500 mt-3 font-medium uppercase tracking-widest">
                                            Step 1 of 2 · Sepolia network
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
