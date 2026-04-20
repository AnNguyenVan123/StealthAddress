import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { checkAvailability, getRentPrice, registerEnsWithStealthKeys } from "../services/ensRegistrationService";

/**
 * useEnsRegistration
 *
 * Manages the state and logic for self-service ENS registration.
 * @param {object} meta - stealthMeta { scanPub, spendPub, indexHash }
 */
export function useEnsRegistration(meta) {
    const [name, setName]                 = useState("");
    const [phase, setPhase]               = useState("idle"); // idle | checking | available | taken | registering | done | error
    const [progress, setProgress]         = useState("");
    const [progressPhase, setProgressPhase] = useState("");
    const [registeredName, setRegisteredName] = useState(null);
    const [rentPrice, setRentPrice]       = useState(null);
    const [error, setError]               = useState("");

    // Normalise: strip .eth suffix, lowercase, trim
    function normaliseName(input) {
        return input.trim().toLowerCase().replace(/\.eth$/, "");
    }

    /**
     * Check if a name is available and fetch its price.
     */
    const checkName = useCallback(async (raw) => {
        const n = normaliseName(raw);
        if (!n || n.length < 3) {
            setPhase("idle");
            setRentPrice(null);
            setError("");
            return;
        }
        setPhase("checking");
        setError("");
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer   = await provider.getSigner();
            const available = await checkAvailability(n, signer);
            if (available) {
                const price = await getRentPrice(n, signer);
                setRentPrice(price);
                setPhase("available");
            } else {
                setRentPrice(null);
                setPhase("taken");
            }
        } catch (err) {
            setError(err.message);
            setPhase("error");
        }
    }, []);

    /**
     * Register the ENS name with the user's stealth keys.
     */
    const register = useCallback(async () => {
        if (!meta?.scanPub || !meta?.spendPub || !meta?.indexHash) {
            setError("Stealth wallet not initialised. Please create or import your wallet first.");
            return;
        }
        const n = normaliseName(name);
        if (!n) return;

        setPhase("registering");
        setError("");

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer   = await provider.getSigner();

            const fullName = await registerEnsWithStealthKeys(
                n,
                {
                    scanPub:   meta.scanPub,
                    spendPub:  meta.spendPub,
                    indexHash: meta.indexHash,
                },
                signer,
                (msg, ph) => {
                    setProgress(msg);
                    setProgressPhase(ph);
                }
            );

            setRegisteredName(fullName);
            setPhase("done");
        } catch (err) {
            setError(err.message);
            setPhase("error");
        }
    }, [name, meta]);

    function reset() {
        setName("");
        setPhase("idle");
        setProgress("");
        setProgressPhase("");
        setRentPrice(null);
        setError("");
    }

    return {
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
    };
}
