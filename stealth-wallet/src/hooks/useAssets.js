import { useState, useEffect } from "react";
import { scanStealthPayments } from "../scanner/scannerEngine";

/**
 * useAssets
 *
 * Fetches stealth wallets for the given meta-address on mount.
 * Used by the Assets.jsx component.
 */
export function useAssets(meta) {
    const [assets, setAssets]   = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]     = useState(null);

    useEffect(() => {
        if (!meta) return;

        let cancelled = false;

        async function load() {
            setIsLoading(true);
            setError(null);
            try {
                const result = await scanStealthPayments(meta);
                if (!cancelled) setAssets(result);
            } catch (err) {
                if (!cancelled) setError(err.message || "Failed to load assets.");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        load();

        return () => { cancelled = true; };
    }, [meta]);

    return { assets, isLoading, error };
}
