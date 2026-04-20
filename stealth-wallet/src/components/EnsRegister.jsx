import { useRef } from "react";
import { ethers } from "ethers";
import { useEnsRegistration } from "../hooks/useEnsRegistration";

// Maps progress phase to step index
const STEPS = ["commit", "commit-tx", "wait", "register", "records", "done"];

function StepDot({ active, done, label }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                done  ? "bg-green-500 border-green-500 text-white" :
                active? "bg-blue-500 border-blue-400 text-white animate-pulse" :
                        "bg-transparent border-white/10 text-gray-600"
            }`}>
                {done ? "✓" : ""}
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wide whitespace-nowrap">{label}</span>
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
        <div className="flex items-start gap-2 py-3">
            {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                    <StepDot
                        active={STEPS[stepIndex] === s.key}
                        done={stepIndex > i || phase === "done"}
                        label={s.label}
                    />
                    {i < steps.length - 1 && (
                        <div className={`flex-1 h-px w-8 mt-[-14px] transition-colors ${stepIndex > i ? "bg-green-500" : "bg-white/10"}`} />
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
        checkName,
        register,
        reset,
    } = useEnsRegistration(meta);

    function handleNameChange(e) {
        const val = e.target.value;
        setName(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => checkName(val), 700);
    }

    const normName   = normaliseName(name);
    const isRegistering = phase === "registering";
    const canRegister   = phase === "available" && normName.length >= 3;

    return (
        <div className="w-full max-w-xl mx-auto animate-in fade-in zoom-in-95">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                {/* Decorative blobs */}
                <div className="absolute top-[-40px] left-[-40px] w-40 h-40 bg-purple-500/10 rounded-full blur-[50px]" />
                <div className="absolute bottom-[-30px] right-[-30px] w-32 h-32 bg-blue-500/10 rounded-full blur-[40px]" />

                {/* ── Header ── */}
                <div className="relative z-10">
                    <h3 className="text-2xl font-extrabold mb-1 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                        Register Your Stealth ENS
                    </h3>
                    <p className="text-sm text-gray-400 mb-6">
                        Get a <span className="text-white font-mono">.eth</span> domain linked to your stealth keys.
                        Senders can then use <span className="text-blue-400 font-mono">yourname.eth</span> instead of raw public keys.
                    </p>

                    {/* ── Done state ── */}
                    {phase === "done" && registeredName && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="text-6xl animate-bounce">🎉</div>
                            <h4 className="text-xl font-bold text-green-400">Registration Complete!</h4>
                            <div className="font-mono text-2xl bg-green-400/10 border border-green-400/20 rounded-2xl px-6 py-3 text-green-300">
                                {registeredName}
                            </div>
                            <p className="text-sm text-gray-400 text-center max-w-xs">
                                Your stealth keys are now publicly linked to this domain.
                                Senders can find you by typing <span className="text-green-400 font-mono">{registeredName}</span> in the Transfer page.
                            </p>
                            <button
                                onClick={reset}
                                className="mt-2 px-6 py-2 text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all"
                            >
                                Register Another
                            </button>
                        </div>
                    )}

                    {/* ── Main form ── */}
                    {phase !== "done" && (
                        <div className="space-y-4">
                            {/* Name input */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    Choose Your Name
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        className={`flex-1 px-4 py-3 pr-20 bg-black/40 border rounded-xl outline-none text-lg font-mono text-white placeholder-gray-600 transition-all ${
                                            phase === "available" ? "border-green-500/60 focus:ring-1 focus:ring-green-500" :
                                            phase === "taken"     ? "border-red-500/60 focus:ring-1 focus:ring-red-500" :
                                            phase === "checking"  ? "border-blue-500/40" :
                                                                     "border-white/10 focus:ring-1 focus:ring-purple-500"
                                        }`}
                                        placeholder="yourname"
                                        value={name}
                                        onChange={handleNameChange}
                                        disabled={isRegistering}
                                        maxLength={32}
                                        id="ens-name-input"
                                    />
                                    <span className="absolute right-4 text-gray-500 font-mono text-sm pointer-events-none">.eth</span>
                                </div>

                                {/* Availability status */}
                                <div className="h-6 mt-1.5">
                                    {phase === "checking" && (
                                        <p className="text-xs text-blue-400 flex items-center gap-1">
                                            <span className="inline-block animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full" />
                                            Checking availability...
                                        </p>
                                    )}
                                    {phase === "available" && (
                                        <p className="text-xs text-green-400">
                                            ✅ <span className="font-mono font-bold">{normName}.eth</span> is available!
                                            {rentPrice !== null && (
                                                <span className="ml-2 text-gray-400">
                                                    ~{parseFloat(ethers.formatEther(rentPrice)).toFixed(5)} ETH/year
                                                </span>
                                            )}
                                        </p>
                                    )}
                                    {phase === "taken" && (
                                        <p className="text-xs text-red-400">
                                            ❌ <span className="font-mono">{normName}.eth</span> is already taken.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Requirements */}
                            {!meta?.scanPub && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-300">
                                    ⚠️ Please create or import your stealth wallet in the Dashboard first.
                                </div>
                            )}

                            {/* Progress section (during registration) */}
                            {isRegistering && (
                                <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                    <ProgressBar phase={progressPhase} />
                                    <p className="text-sm text-blue-300 mt-2 font-mono">{progress}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Please approve both MetaMask transactions and keep this tab open during the 60s wait.
                                    </p>
                                </div>
                            )}

                            {/* Error */}
                            {phase === "error" && error && (
                                <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-300 leading-relaxed">
                                    ❌ {error}
                                </div>
                            )}

                            {/* What will be registered info box */}
                            {canRegister && meta?.scanPub && (
                                <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 text-xs text-gray-400 space-y-1">
                                    <p className="text-purple-300 font-semibold mb-2">📦 What gets registered automatically:</p>
                                    <p>• <span className="text-white font-mono">stealth.scanPub</span> → your scan public key</p>
                                    <p>• <span className="text-white font-mono">stealth.spendPub</span> → your spend public key</p>
                                    <p>• <span className="text-white font-mono">stealth.indexHash</span> → your index hash</p>
                                    <p>• <span className="text-white font-mono">addr</span> → your MetaMask address</p>
                                </div>
                            )}

                            {/* Register button */}
                            <div className="pt-2">
                                <button
                                    onClick={register}
                                    disabled={!canRegister || isRegistering || !meta?.scanPub}
                                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/20 text-white font-bold tracking-wider uppercase rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex justify-center items-center gap-3 transform hover:scale-[1.01] active:scale-95"
                                >
                                    {isRegistering ? (
                                        <>
                                            <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                            {progressPhase === "wait" ? progress : "Registering..."}
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xl">🔖</span>
                                            Register {normName ? `${normName}.eth` : "your name"}
                                        </>
                                    )}
                                </button>

                                <p className="text-center text-[11px] text-gray-600 mt-3">
                                    Requires 3 MetaMask transactions + 65s wait · Sepolia network
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
