import { useState, useRef, useCallback } from "react";
import { resolveEnsName, isEnsName } from "../services/ensService";

/**
 * useEnsResolver
 *
 * Debounced ENS name resolution hook.
 * Resolves stealth text records when user types a ".eth" name.
 *
 * @param {function} onResolved - Called with { scanPub, spendPub, indexHash, address, ensName }
 * @returns {{ ensInput, setEnsInput, ensStatus, ensResolved, clearEns }}
 */
export function useEnsResolver(onResolved) {
    const [ensInput, setEnsInput] = useState("");
    // status: 'idle' | 'resolving' | 'resolved' | 'error'
    const [ensStatus, setEnsStatus] = useState("idle");
    const [ensError, setEnsError] = useState("");
    const [ensResolved, setEnsResolved] = useState(null);
    const debounceRef = useRef(null);

    const resolve = useCallback(
        (value) => {
            // Clear previous debounce
            if (debounceRef.current) clearTimeout(debounceRef.current);

            if (!value || !isEnsName(value)) {
                setEnsStatus("idle");
                setEnsError("");
                setEnsResolved(null);
                return;
            }

            setEnsStatus("resolving");
            setEnsError("");
            setEnsResolved(null);

            debounceRef.current = setTimeout(async () => {
                try {
                    const result = await resolveEnsName(value);
                    if (!result) {
                        setEnsStatus("idle");
                        return;
                    }
                    setEnsResolved(result);
                    setEnsStatus("resolved");
                    onResolved(result);
                } catch (err) {
                    setEnsStatus("error");
                    setEnsError(err.message);
                    setEnsResolved(null);
                    onResolved(null); // clear resolved data
                }
            }, 700); // 700ms debounce
        },
        [onResolved]
    );

    function handleEnsInput(value) {
        setEnsInput(value);
        resolve(value);
    }

    function clearEns() {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setEnsInput("");
        setEnsStatus("idle");
        setEnsError("");
        setEnsResolved(null);
        onResolved(null);
    }

    return {
        ensInput,
        handleEnsInput,
        ensStatus,
        ensError,
        ensResolved,
        clearEns,
    };
}
