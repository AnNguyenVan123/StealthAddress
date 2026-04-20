import { ethers } from "ethers";

const RPC_URL = import.meta.env.VITE_RPC_URL;

// ENS Registry is deployed at the same address on both Mainnet and Sepolia.
const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

// ENS Universal Resolver on Sepolia
// (deployed by ENS DAO at same address as mainnet)
const ENS_REGISTRY_ABI = [
    "function resolver(bytes32 node) view returns (address)",
    "function owner(bytes32 node) view returns (address)",
];

const ENS_RESOLVER_ABI = [
    "function addr(bytes32 node) view returns (address)",
    "function text(bytes32 node, string key) view returns (string)",
];

// Explicitly tell ethers this is Sepolia (chainId 11155111) with ENS support
const SEPOLIA_NETWORK = {
    name: "sepolia",
    chainId: 11155111,
    ensAddress: ENS_REGISTRY_ADDRESS,
};

// Provider connected to Sepolia with ENS registry configured
const provider = new ethers.JsonRpcProvider(RPC_URL, SEPOLIA_NETWORK, {
    staticNetwork: true,
});

/**
 * ENS text record keys used by the Stealth Wallet system.
 * Convention follows EIP-6538 stealth meta-address standard.
 */
const ENS_KEYS = {
    scanPub: "stealth.scanPub",
    spendPub: "stealth.spendPub",
    indexHash: "stealth.indexHash",
};

/**
 * Resolves an ENS name and fetches all stealth text records on Sepolia.
 *
 * @param {string} ensName - e.g. "alice.eth"
 * @returns {{ scanPub, spendPub, indexHash, ensName, address } | null}
 * @throws if ENS name doesn't resolve or stealth records are missing
 */
export async function resolveEnsName(ensName) {
    if (!ensName || !ensName.includes(".")) return null;

    const trimmed = ensName.trim().toLowerCase();

    // Step 1: Resolve address (uses ethers built-in ENS on the configured provider)
    let address;
    try {
        address = await provider.resolveName(trimmed);
    } catch (e) {
        throw new Error(`Failed to resolve "${trimmed}": ${e.message}`);
    }

    if (!address) {
        throw new Error(
            `ENS name "${trimmed}" does not resolve to any address on Sepolia. ` +
            `Make sure it exists on Sepolia ENS (app.ens.domains).`
        );
    }

    // Step 2: Get ENS resolver and fetch text records
    let resolver;
    try {
        resolver = await provider.getResolver(trimmed);
    } catch (e) {
        throw new Error(`Failed to get resolver for "${trimmed}": ${e.message}`);
    }

    if (!resolver) {
        throw new Error(`No ENS resolver found for "${trimmed}" on Sepolia.`);
    }

    // Step 3: Fetch all stealth text records in parallel
    const [scanPub, spendPub, indexHash] = await Promise.all([
        resolver.getText(ENS_KEYS.scanPub).catch(() => null),
        resolver.getText(ENS_KEYS.spendPub).catch(() => null),
        resolver.getText(ENS_KEYS.indexHash).catch(() => null),
    ]);

    const missing = [];
    if (!scanPub)    missing.push("stealth.scanPub");
    if (!spendPub)   missing.push("stealth.spendPub");
    if (!indexHash)  missing.push("stealth.indexHash");

    if (missing.length > 0) {
        throw new Error(
            `ENS name "${trimmed}" is registered but missing stealth records: ${missing.join(", ")}.\n` +
            `Ask the recipient to add these text records via app.ens.domains on Sepolia.`
        );
    }

    return { scanPub, spendPub, indexHash, ensName: trimmed, address };
}

/**
 * Checks whether a string looks like an ENS name (has a dot, not a hex address).
 * @param {string} input
 */
export function isEnsName(input) {
    return (
        typeof input === "string" &&
        input.includes(".") &&
        !input.startsWith("0x")
    );
}
