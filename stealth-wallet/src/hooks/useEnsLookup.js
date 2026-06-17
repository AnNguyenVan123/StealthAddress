import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { formatError } from "../utils/errors";

const RPC_URL = import.meta.env.VITE_RPC_URL;

const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const SEPOLIA_NETWORK = {
    name: "sepolia",
    chainId: 11155111,
    ensAddress: ENS_REGISTRY_ADDRESS,
};

const provider = new ethers.JsonRpcProvider(RPC_URL, SEPOLIA_NETWORK, {
    staticNetwork: true,
});

// ENS Subgraph endpoint for Sepolia (via The Graph decentralised network)
const ENS_SUBGRAPH_URL =
    "https://api.studio.thegraph.com/query/49574/enssepolia/version/latest";

/**
 * Query the ENS subgraph for all domains that have a stealth.scanPub text
 * record matching the given scanPub value.
 *
 * Returns an array of full ENS names (e.g. ["alice.eth", "bob.eth"]).
 */
async function queryEnsByTextRecord(scanPub) {
    // Trim/lowercase for comparison
    const scanPubLower = scanPub.toLowerCase();

    const query = `
    {
      textChangeds(
        first: 10
        where: { key: "stealth.scanPub" }
        orderBy: blockNumber
        orderDirection: desc
      ) {
        value
        resolver {
          domain {
            name
          }
        }
      }
    }
  `;

    try {
        const res = await fetch(ENS_SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const events = data?.data?.textChangeds ?? [];

        const matched = [];
        for (const ev of events) {
            if (ev.value?.toLowerCase() === scanPubLower) {
                const name = ev.resolver?.domain?.name;
                if (name && !matched.includes(name)) matched.push(name);
            }
        }
        return matched;
    } catch (err) {
        console.warn("[ENS subgraph] query failed:", err.message);
        return [];
    }
}

/**
 * Verify on-chain that a given ENS name actually has the expected stealth.scanPub.
 * Returns true if valid, false otherwise.
 */
async function verifyEnsOnChain(ensName, expectedScanPub) {
    try {
        const resolver = await provider.getResolver(ensName);
        if (!resolver) return false;
        const scanPub = await resolver.getText("stealth.scanPub").catch(() => null);
        return !!scanPub && scanPub.toLowerCase() === expectedScanPub.toLowerCase();
    } catch {
        return false;
    }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_KEY = "stealth_ens_cache"; // { [scanPub]: ["name1.eth", "name2.eth"] }

function readCache(scanPub) {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const store = JSON.parse(raw);
        return store[scanPub.toLowerCase()] ?? [];
    } catch {
        return [];
    }
}

function writeCache(scanPub, names) {
    try {
        const raw = localStorage.getItem(LS_KEY);
        const store = raw ? JSON.parse(raw) : {};
        store[scanPub.toLowerCase()] = names;
        localStorage.setItem(LS_KEY, JSON.stringify(store));
    } catch {
        // ignore storage errors
    }
}

/**
 * Save a newly registered ENS name for a given scanPub into the local cache.
 * Called by useEnsRegistration after successful registration.
 */
export function cacheRegisteredEns(scanPub, ensName) {
    const existing = readCache(scanPub);
    if (!existing.includes(ensName)) {
        writeCache(scanPub, [...existing, ensName]);
    }
}

// ─── The hook ─────────────────────────────────────────────────────────────────

/**
 * useEnsLookup
 *
 * Resolves all ENS names linked to the user's stealth wallet.
 * Three-layer strategy (fastest → most complete):
 *   L1  localStorage cache    — instant, populated when registering via this app
 *   L2  ENS subgraph query    — catches names registered earlier / in other sessions
 *   L3  Reverse ENS lookup    — bonus: if MetaMask address has a primary ENS name
 *
 * Returns the first confirmed name as `ensName`, plus `ensNames` (all of them).
 *
 * @param {object|null} meta - { scanPub, spendPub, indexHash }
 */
export function useEnsLookup(meta) {
    const [ensName, setEnsName] = useState(null);   // primary (first found)
    const [ensNames, setEnsNames] = useState([]);    // all found names
    const [ensStatus, setEnsStatus] = useState("idle"); // idle | loading | found | none | error
    const [ensError, setEnsError] = useState(null);

    useEffect(() => {
        if (!meta?.scanPub) {
            setEnsName(null);
            setEnsNames([]);
            setEnsStatus("idle");
            return;
        }

        let cancelled = false;

        async function lookup() {
            setEnsStatus("loading");
            setEnsError(null);

            const collected = new Set(); // deduplicated names

            try {
                // ── Layer 1: localStorage cache (instant) ─────────────────────
                const cached = readCache(meta.scanPub);
                cached.forEach((n) => collected.add(n));

                if (collected.size > 0 && !cancelled) {
                    const arr = [...collected];
                    setEnsName(arr[0]);
                    setEnsNames(arr);
                    setEnsStatus("found");
                    // Don't return — continue to subgraph to pick up any new names
                }

                // ── Layer 2: ENS subgraph query ───────────────────────────────
                const subgraphNames = await queryEnsByTextRecord(meta.scanPub);
                if (cancelled) return;

                // Verify each subgraph result on-chain and add to set
                for (const name of subgraphNames) {
                    if (!collected.has(name)) {
                        const valid = await verifyEnsOnChain(name, meta.scanPub);
                        if (valid) collected.add(name);
                    }
                }
                if (cancelled) return;

                if (collected.size > 0) {
                    const arr = [...collected];
                    // Persist everything we found into cache
                    writeCache(meta.scanPub, arr);
                    setEnsName(arr[0]);
                    setEnsNames(arr);
                    setEnsStatus("found");
                    return;
                }

                // ── Layer 3: Reverse ENS lookup on connected wallet ───────────
                if (window.ethereum) {
                    try {
                        const browserProvider = new ethers.BrowserProvider(window.ethereum);
                        const accounts = await browserProvider.send("eth_accounts", []);
                        if (accounts && accounts.length > 0) {
                            const address = accounts[0];
                            const reversed = await provider.lookupAddress(address);
                            if (reversed && !cancelled) {
                                const valid = await verifyEnsOnChain(reversed, meta.scanPub);
                                if (valid) {
                                    writeCache(meta.scanPub, [reversed]);
                                    if (!cancelled) {
                                        setEnsName(reversed);
                                        setEnsNames([reversed]);
                                        setEnsStatus("found");
                                        return;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[useEnsLookup] Reverse lookup failed:", e);
                    }
                }

                if (!cancelled) setEnsStatus("none");
            } catch (err) {
                if (!cancelled) {
                    console.error("[useEnsLookup] error:", err);
                    setEnsError(err.message);
                    setEnsStatus("error");
                }
            }
        }

        lookup();

        const handleEnsUpdate = () => {
            if (meta?.scanPub) lookup();
        };
        window.addEventListener("ens_updated", handleEnsUpdate);

        return () => { 
            cancelled = true; 
            window.removeEventListener("ens_updated", handleEnsUpdate);
        };
    }, [meta?.scanPub]);

    return { ensName, ensNames, ensStatus, ensError };
}
