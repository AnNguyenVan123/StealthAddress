import { ethers } from "ethers"
import { computeViewTag } from "../stealth/stealthAddress.js"
import { stealthAccountFactoryAbi } from "../abi/stealthAccountFactoryAbi"
import { computeIndexCommitment } from "../stealth/zkIntegration.js"

const RPC = import.meta.env.VITE_RPC_URL
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000"

const provider = new ethers.JsonRpcProvider(RPC)
const announcerAddress = import.meta.env.VITE_ANNOUNCER_ADDRESS
const factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS

const announcerAbi = [
    "event Announcement(uint256 indexed schemeId,address indexed stealthAddress,address indexed caller,bytes ephemeralPubKey,bytes metadata)"
]

const n = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141")

// The scanner now derives the abstract account directly using the known meta.index
// rather than fetching the tree state from the server.

/**
 * Scan the blockchain for stealth payments belonging to this recipient.
 *
 * Follows the standard ERC-5564 / Vitalik's article scanning protocol:
 *
 * 1. VIEW TAG fast-skip (×256 speedup):
 *    metadata byte[1] = first byte of hash(S).  Single EC multiply to check.
 *    Only ~1/256 events pass this and proceed to full derivation.
 *
 * 2. FULL ECDH derivation:
 *    Compute stealthEOA = address(spend_pub + G*hash(S)).
 *
 * 3. DIRECT COMPARISON (per ERC-5564 standard):
 *    event.stealthAddress == derived stealthEOA → it's ours.
 *    No indexCommitment needed for detection.
 *
 * 4. POST-MATCH: find abstract account for spending.
 *    Compute indexCommitment = poseidon(meta.indexHash, stealthEOA)
 *    then call factory.getAddress(indexCommitment).
 *
 * @param {object} meta  { scanPriv, spendPriv, index, indexHash }
 * @returns {object[]}   Array of found stealth accounts
 */
export async function scanStealthPayments(meta) {

    const announcer = new ethers.Contract(announcerAddress, announcerAbi, provider)
    const factory = new ethers.Contract(factoryAddress, stealthAccountFactoryAbi, provider)
    const scanKey = new ethers.SigningKey(meta.scanPriv)

    const latest = await provider.getBlockNumber()
    const start = Math.max(latest - 1000, 0)
    const STEP = 10
    const results = []

    for (let from = start; from < latest; from += STEP) {
        const to = Math.min(from + STEP - 1, latest)
        console.log(`[scan] blocks ${from} → ${to}`)

        let events = []
        try {
            events = await announcer.queryFilter("Announcement", from, to)
        } catch (e) {
            console.log(e)
            console.log("[scan] RPC skip")
            continue
        }

        for (const e of events) {
            const R = e.args.ephemeralPubKey          // sender's ephemeral pubkey (from event)
            const announcedAddress = e.args.stealthAddress  // stealthEOA (per ERC-5564 standard)
            const metadata = e.args.metadata

            // ── Fast-path: View Tag check ───────────────────────────────────
            // metadata layout: [0x01 version][1 byte viewTag][...description]
            if (metadata && metadata.length >= 6 && metadata.slice(2, 4) === "01") {
                const eventViewTag = parseInt(metadata.slice(4, 6), 16)
                const ourViewTag = computeViewTag(meta.scanPriv, R)
                if (ourViewTag !== eventViewTag) continue
            }

            // ── Full ECDH derivation ─────────────────────────────────────────
            const sharedPoint = scanKey.computeSharedSecret(R)
            const sharedHash = ethers.keccak256(sharedPoint)

            const stealthPriv = (BigInt(meta.spendPriv) + BigInt(sharedHash)) % n
            const stealthPrivHex = "0x" + stealthPriv.toString(16).padStart(64, "0")
            const stealthEOA = new ethers.Wallet(stealthPrivHex).address

            console.log("stealthEOA", stealthEOA)
            console.log("announcedAddress", announcedAddress)

            // ── Match Abstract Account from indexCommitment ────────────────────
            if (!meta.indexHash) {
                console.warn("[scan] Missing meta.indexHash! Cannot compute indexCommitment.");
                continue;
            }

            const matchedIndexCommitment = await computeIndexCommitment(meta.indexHash, stealthEOA);
            const abstractAccount = await factory.getFunction("getAddress")(matchedIndexCommitment);

            // ── Flexible Comparison (EOA vs AA) ───────────────────────────────────
            // 1. standard sendStealthPayment announces stealthEOA
            // 2. abstract account's executeStealthTransfer announces abstractAccount
            const isEoaMatch = stealthEOA.toLowerCase() === announcedAddress.toLowerCase()
            const isAaMatch = abstractAccount && abstractAccount.toLowerCase() === announcedAddress.toLowerCase()

            if (!isEoaMatch && !isAaMatch) continue

            // Determine balance: check abstract account if deployed, else stealthEOA
            const targetAddress = abstractAccount ?? announcedAddress
            const balance = await provider.getBalance(targetAddress)

            console.log(`[scan] ✅ Found payment at stealthEOA=${stealthEOA} abstractAccount=${abstractAccount}`)

            results.push({
                address: targetAddress,                  // abstract account (for spending)
                stealthEOA,                              // raw ECDH EOA
                privateKey: stealthPrivHex,              // stealth private key
                indexCommitment: matchedIndexCommitment, // for ZK spend proof
                balance: ethers.formatEther(balance),
                metadata: ethers.toUtf8String(
                    ethers.getBytes(metadata).slice(2)   // strip version+viewTag prefix
                ),
            })
        }
    }

    return results
}