import { ethers } from "ethers"

const n =
    BigInt(
        "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
    )

/**
 * Generate a stealth address for a recipient.
 *
 * Returns:
 *  - address:      The stealth EOA (ECDH-derived), used as the Abstract Account owner
 *  - ephemeralPub: Sender's ephemeral public key R (published on-chain)
 *  - viewTag:      1-byte view tag = first byte of hash(sharedSecret).
 *                  Allows the recipient's scanner to skip 255/256 announcements
 *                  without doing full address derivation (per ERC-5564 spec).
 *
 * Key roles (separate spend/view keys per ERC-5564):
 *  - scanPub  (viewing key K_v):  used in ECDH to derive the shared secret
 *  - spendPub (spending key K_s): used to derive the stealth public key
 *
 * @param {string} scanPub  Recipient's scan (viewing) public key
 * @param {string} spendPub Recipient's spend public key
 */
export function generateStealthAddress({
    scanPub,
    spendPub
}) {

    // ── Ephemeral key pair ──────────────────────────────────────────────────
    const ephWallet  = ethers.Wallet.createRandom()
    const signingKey = new ethers.SigningKey(ephWallet.privateKey)
    const R          = signingKey.publicKey   // published on-chain

    // ── ECDH shared secret  S = r * K_v ───────────────────────────────────
    const sharedPoint  = signingKey.computeSharedSecret(scanPub)
    const sharedHash   = ethers.keccak256(sharedPoint)      // hash(S)

    // ── View tag: first byte of hash(S) ────────────────────────────────────
    // Recipient only needs one EC multiplication to compute hash(S)[0] and
    // then compare — skipping 255/256 events cheaply.
    const viewTag = parseInt(sharedHash.slice(2, 4), 16)    // 0-255

    // ── Scalar tweak for the stealth key ───────────────────────────────────
    const scalar    = BigInt(sharedHash) % n
    const scalarHex = "0x" + scalar.toString(16).padStart(64, "0")

    const sKey  = new ethers.SigningKey(scalarHex)
    const sPub  = sKey.publicKey

    // ── Stealth public key  P = K_s + G*hash(S)  ───────────────────────────
    const stealthPub     = ethers.SigningKey.addPoints(spendPub, sPub)
    const stealthAddress = ethers.computeAddress(stealthPub)

    return {
        address:      stealthAddress,   // stealth EOA (owner of Abstract Account)
        ephemeralPub: R,                // published in Announcement event
        viewTag,                        // 1-byte shortcut for fast scanning
    }
}

/**
 * Derive the stealth private key from the recipient's keys and the ephemeral pubkey.
 *
 * Key roles (separate spend/view keys per ERC-5564):
 *  - scanPriv  (viewing private key k_v):   used in ECDH to recover shared secret
 *  - spendPriv (spending private key k_s):  used to compute the stealth private key
 *
 * stealth private key  p = k_s + hash(S)  mod n
 *
 * @param {string} scanPriv    Recipient's scan private key
 * @param {string} spendPriv   Recipient's spend private key
 * @param {string} ephemeralPub Sender's ephemeral public key R (from event)
 */
export function deriveStealth({
    scanPriv,
    spendPriv,
    ephemeralPub
}) {

    const scanKey      = new ethers.SigningKey(scanPriv)
    const sharedPoint  = scanKey.computeSharedSecret(ephemeralPub)
    const sharedHash   = ethers.keccak256(sharedPoint)

    const priv = (BigInt(spendPriv) + BigInt(sharedHash)) % n

    return "0x" + priv.toString(16).padStart(64, "0")
}

/**
 * Compute the view tag for a given scan private key and ephemeral public key.
 * Used in the scanner for fast filtering.
 *
 * @param {string} scanPriv    Recipient's scan private key (viewing key)
 * @param {string} ephemeralPub Sender's ephemeral public key R (from event)
 * @returns {number} The view tag byte (0-255)
 */
export function computeViewTag(scanPriv, ephemeralPub) {

    const scanKey     = new ethers.SigningKey(scanPriv)
    const sharedPoint = scanKey.computeSharedSecret(ephemeralPub)
    const sharedHash  = ethers.keccak256(sharedPoint)

    return parseInt(sharedHash.slice(2, 4), 16)
}