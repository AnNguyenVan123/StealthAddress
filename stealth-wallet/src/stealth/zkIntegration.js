import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

let poseidonInstance = null;
let F = null;

/**
 * Initializes and returns the Poseidon hashing instance.
 */
export async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
        F = poseidonInstance.F;
    }
    return poseidonInstance;
}

export async function poseidonHash(inputs) {
    const pos = await getPoseidon();
    const hashInF = pos(inputs);
    return "0x" + F.toObject(hashInF).toString(16).padStart(64, '0');
}

export async function poseidon2(a, b) {
    return poseidonHash([BigInt(a), BigInt(b)]);
}

export async function poseidon1(a) {
    return poseidon2(a, "0x0");
}

// ─── SERVER INTERACTION ──────────────────────────────────────────────────

/**
 * Publish the account leaf at wallet creation time.
 *
 * Computes:
 *   k    = poseidon(spendPriv)          ← the actual Merkle tree leaf
 *   addr = computeAddress(spendPub)     ← identity address (for indexCommitment calculation)
 *
 * POSTs both to the server, which:
 *   - assigns the next index
 *   - computes indexCommitment = poseidon(poseidon(index, 0), addr)   ← factory CREATE2 salt
 *   - inserts k (NOT indexCommitment) into the Merkle tree
 *   - pushes the new root on-chain
 *
 * @param {string} spendPriv  0x-prefixed spending private key
 * @param {string} spendPub   0x-prefixed spending public key (uncompressed, 0x04...)
 * @returns {{ index: number, indexCommitment: string, leaf: string, newRoot: string }}
 */
export async function publishAccountLeaf(spendPriv, spendPub) {
    const pos = await getPoseidon();
    const F = pos.F;

    // k = poseidon(spendPriv) — matches the circuit: k <== hash_x.out where x = spendPriv
    const kField = pos([BigInt(spendPriv)]);

    const k = "0x" + F.toObject(kField).toString(16).padStart(64, '0');

    // identity address = the EOA address of the spend public key
    const identityAddress = ethers.computeAddress(spendPub);

    const response = await fetch(`${SERVER_URL}/leaves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: identityAddress, leaf: k })
    });
    if (!response.ok) {
        throw new Error((await response.json()).error || response.statusText);
    }
    // Returns { success, index, indexCommitment, leaf, newRoot, txHash, totalLeaves }
    return response.json();
}

/**
 * Check whether a leaf (k = poseidon(spendPriv)) already exists in the server
 * tree. If it does, returns its stored index and recomputed indexCommitment.
 *
 * @param {string} kHex      0x-prefixed k value
 * @param {string} address   Identity address (computeAddress(spendPub)) — needed
 *                           for the server to recompute indexCommitment.
 * @returns {Promise<{ found: boolean, index?: number, indexCommitment?: string }>}
 */
export async function lookupLeaf(kHex, address) {
    const url = new URL(`${SERVER_URL}/leaves/find/${encodeURIComponent(kHex)}`);
    url.searchParams.set('address', address);
    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error((await response.json()).error || response.statusText);
    }
    return response.json(); // { found, index?, indexCommitment?, newRoot? }
}

/**
 * Rollback: removes a previously published leaf from the server tree.
 * Only needed if on-chain deployment fails after publishAccountLeaf succeeds.
 *
 * @param {string} leaf  The k value (poseidon(spendPriv)) returned by publishAccountLeaf
 */
export async function removeLeafFromServer(leaf) {
    const response = await fetch(
        `${SERVER_URL}/leaves/${encodeURIComponent(leaf)}`,
        { method: "DELETE" }
    );
    if (!response.ok) {
        throw new Error((await response.json()).error || response.statusText);
    }
    return response.json();
}

/**
 * Gets the Merkle proof for a specific leaf k.
 */
export async function getLeafProof(kHex) {
    const response = await fetch(`${SERVER_URL}/proof/${kHex}`);
    if (!response.ok) {
        throw new Error((await response.json()).error || response.statusText);
    }
    return response.json();
}

// ─── CONTRACT INTERACTION ────────────────────────────────────────────────

/**
 * Compute index hash = poseidon(index, 0)
 * This is what Bob shares with Alice to hide his raw index.
 *
 * @param {number|bigint} index - Leaf index in the tree
 * @returns {Promise<string>} indexHash as 0x-prefixed hex
 */
export async function computeIndexHash(index) {
    const pos = await getPoseidon();
    const F = pos.F;
    const indexHashField = pos([BigInt(index), 0n]);
    const indexHashBigInt = F.toObject(indexHashField);
    return "0x" + indexHashBigInt.toString(16).padStart(64, '0');
}

/**
 * Computes indexCommitment client-side.
 * indexCommitment = poseidon(indexHash, sharedSecret)
 *
 * @param {string} indexHashHex - 0x-prefixed hex string of the indexHash
 * @param {string} sharedSecretHex - 0x-prefixed hex shared secret
 * @returns {Promise<string>} indexCommitment as 0x-prefixed hex
 */
export async function computeIndexCommitment(indexHashHex, sharedSecretHex) {
    const pos = await getPoseidon();
    const F = pos.F;
    const commitmentField = pos([BigInt(indexHashHex), BigInt(sharedSecretHex)]);
    const commitmentBigInt = F.toObject(commitmentField);
    return "0x" + commitmentBigInt.toString(16).padStart(64, '0');
}

/**
 * Executes a transaction from the ZK stealth account by delegating it
 * to the generic off-chain relayer to execute as a UserOperation, paying gas.
 */
export async function executeFromZkStealth(
    stealthAccountAddress,
    recipientLeafHex,
    recipientAbstractAccount,
    amountEther,
    auth,
    factoryAddress,
    announcerAddress,
    schemeId,
    ephemeralPub,
    metadata
) {
    const formattedAuth = {
        a: auth.proofA,
        b: auth.proofB,
        c: auth.proofC
    };

    console.log("Delegating execution to Relayer (UserOperation API)...");

    const response = await fetch(`${SERVER_URL}/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            senderStealthAddress: stealthAccountAddress,
            recipientLeafHex,
            recipientAbstractAccount,
            valueString: ethers.parseEther(amountEther).toString(),
            auth: formattedAuth,
            factoryAddress,
            announcerAddress,
            schemeId,
            ephemeralPub,
            metadata
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || response.statusText);
    }

    const result = await response.json();
    return { hash: result.txHash };
}
