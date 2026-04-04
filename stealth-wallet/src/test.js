import { ethers } from "ethers"

const scanPriv =
"0xf956d5e7e6533c4b818ad7fd0203653b33df432d3bbcdb404028ebc66b2f70fd"

const spendPriv =
"0x33379da019bc095cbba79b888f2abcd16b242b3c524138b6dbf126b25520fc67"

const spendPub =
"0x04052f9bc789ea9b6844b198e50579358299ff23cd48c1f4791e1fada3899e365e4664bed7be53c1767b923b37d073e70682b8adf801a2dc9ab81ee8b7f6328a42"

const ephemeralPub =
"0x04362CC0AC14351B544D659EE570E194D7E2DAABB2DA1D5B853780804B15C6B53D44005EA1C527C8164BAE7E6199BA9A15A3633659AD432634810E7767A4C8C3A5"

const metadata =
"0x455448207061796D656E74"

const expected =
"0xBF005b564e8312a6f14306B564b5Fe6E60156A1d"

async function verify() {

    const scanKey =
        new ethers.SigningKey(scanPriv)

    // ECDH
    const shared =
        scanKey.computeSharedSecret(
            ephemeralPub
        )

    const hash =
        ethers.keccak256(
            ethers.concat([shared, metadata])
        )

    const tweak =
        BigInt(hash)

    const n =
    BigInt(
    "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
    )

    const spend =
        BigInt(spendPriv)

    // stealth private key
    const stealthPriv =
        (spend + tweak) % n

    const stealthPrivHex =
        "0x" +
        stealthPriv
            .toString(16)
            .padStart(64,"0")

    const stealthWallet =
        new ethers.Wallet(
            stealthPrivHex
        )

    console.log(
        "computed:",
        stealthWallet.address
    )

    console.log(
        "expected:",
        expected
    )
}

verify()