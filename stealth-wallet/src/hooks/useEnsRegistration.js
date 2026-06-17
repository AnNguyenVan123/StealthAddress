import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { 
    checkAvailability, 
    getRentPrice, 
    createCommitment, 
    submitCommitment, 
    checkCommitmentStatus, 
    registerName, 
    setStealthRecords 
} from "../services/ensRegistrationService";
import { cacheRegisteredEns } from "./useEnsLookup";
import { formatError } from "../utils/errors";

const PENDING_REG_KEY = "ens_pending_registration";

/**
 * useEnsRegistration
 *
 * Manages the state and logic for self-service ENS registration using a 2-step process.
 * @param {object} meta - stealthMeta { scanPub, spendPub, indexHash }
 */
export function useEnsRegistration(meta) {
    const [name, setName]                 = useState("");
    const [phase, setPhase]               = useState("idle"); // idle | checking | available | taken | committing | waiting | registering | done | error
    const [progress, setProgress]         = useState("");
    const [progressPhase, setProgressPhase] = useState("");
    const [registeredName, setRegisteredName] = useState(null);
    const [rentPrice, setRentPrice]       = useState(null);
    const [error, setError]               = useState("");
    
    const [pendingReg, setPendingReg]     = useState(null);
    const [timeRemaining, setTimeRemaining] = useState(0);

    // Normalise: strip .eth suffix, lowercase, trim
    function normaliseName(input) {
        return input.trim().toLowerCase().replace(/\.eth$/, "");
    }

    // Load pending registration on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(PENDING_REG_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // check if it's expired (e.g. > 24 hours). maxCommitmentAge is 86400.
                if (Date.now() - parsed.timestamp * 1000 < 86400 * 1000) {
                    setPendingReg(parsed);
                    setName(parsed.name);
                    setPhase("waiting");
                } else {
                    localStorage.removeItem(PENDING_REG_KEY);
                }
            }
        } catch (e) {}
    }, []);

    // Timer for waiting phase
    useEffect(() => {
        if (phase === "waiting" && pendingReg) {
            const checkTimer = () => {
                const now = Math.floor(Date.now() / 1000);
                const elapsed = now - pendingReg.timestamp;
                const remaining = 60 - elapsed;
                if (remaining > 0) {
                    setTimeRemaining(remaining);
                } else {
                    setTimeRemaining(0);
                }
            };
            checkTimer();
            const interval = setInterval(checkTimer, 1000);
            return () => clearInterval(interval);
        }
    }, [phase, pendingReg]);

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
            const result = await checkAvailability(n, signer);
            if (result.available) {
                const price = await getRentPrice(n, signer);
                setRentPrice(price);
                setPhase("available");
            } else {
                setRentPrice(null);
                setPhase("taken");
            }
        } catch (err) {
            setError(formatError(err));
            setPhase("error");
        }
    }, []);

    /**
     * Step 1: Create and submit the commitment
     */
    const startCommit = useCallback(async () => {
        if (!meta?.scanPub || !meta?.spendPub || !meta?.indexHash) {
            setError("Stealth wallet not initialised. Please create or import your wallet first.");
            return;
        }
        const n = normaliseName(name);
        if (!n) return;

        setPhase("committing");
        setError("");
        setProgress("Requesting to register...");
        setProgressPhase("commit");

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer   = await provider.getSigner();
            const ownerAddress = await signer.getAddress();

            const { registration, secret } = await createCommitment(n, ownerAddress);
            
            setProgress("Submitting transaction (1/3)...");
            setProgressPhase("commit-tx");
            
            const { commitmentHash, timestamp } = await submitCommitment(registration, signer);
            
            const newPending = {
                name: n,
                registration,
                secret,
                commitmentHash,
                timestamp
            };
            
            localStorage.setItem(PENDING_REG_KEY, JSON.stringify(newPending));
            setPendingReg(newPending);
            setPhase("waiting");
            setProgressPhase("wait");
        } catch (err) {
            setError(formatError(err));
            // If failed to commit, we can go back to available
            setPhase("available");
        }
    }, [name, meta]);

    /**
     * Step 2: Complete the registration and set records
     */
    const completeRegister = useCallback(async () => {
        if (!pendingReg) return;
        setPhase("registering");
        setError("");
        setProgress("Completing registration (2/3)...");
        setProgressPhase("register");

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer   = await provider.getSigner();
            
            // Re-check timestamp on-chain to be safe
            const onchainTs = await checkCommitmentStatus(pendingReg.commitmentHash);
            if (onchainTs === 0) {
                throw new Error("Commitment not found on-chain. Please start over.");
            }
            
            await registerName(pendingReg.registration, signer);
            
            setProgress("Setting stealth records (3/3)...");
            setProgressPhase("records");
            
            await setStealthRecords(pendingReg.name, meta, signer);
            
            localStorage.removeItem(PENDING_REG_KEY);
            setPendingReg(null);
            
            const fullName = `${pendingReg.name}.eth`;
            setRegisteredName(fullName);
            // Persist to localStorage so useEnsLookup finds it instantly
            if (meta?.scanPub) {
                cacheRegisteredEns(meta.scanPub, fullName);
                window.dispatchEvent(new Event("ens_updated"));
            }
            setPhase("done");
            setProgressPhase("done");
        } catch (err) {
            setError(formatError(err));
            // Failed during registration, go back to waiting so they can retry
            setPhase("waiting");
            setProgressPhase("wait");
        }
    }, [pendingReg, meta]);

    const cancelPending = useCallback(() => {
        localStorage.removeItem(PENDING_REG_KEY);
        setPendingReg(null);
        setPhase("idle");
        setName("");
    }, []);

    function reset() {
        setName("");
        setPhase("idle");
        setProgress("");
        setProgressPhase("");
        setRentPrice(null);
        setError("");
        setPendingReg(null);
        localStorage.removeItem(PENDING_REG_KEY);
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
        timeRemaining,
        pendingReg,
        checkName,
        startCommit,
        completeRegister,
        cancelPending,
        reset,
    };
}
