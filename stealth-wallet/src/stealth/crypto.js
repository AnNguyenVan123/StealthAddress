import { ethers } from "ethers"

export function createMetaAddress() {

    const scanWallet = ethers.Wallet.createRandom()
    const spendWallet = ethers.Wallet.createRandom()

    const scanKey =
        new ethers.SigningKey(scanWallet.privateKey)

    const spendKey =
        new ethers.SigningKey(spendWallet.privateKey)

    return {

        scanPriv: scanWallet.privateKey,
        spendPriv: spendWallet.privateKey,
        scanPub: scanKey.publicKey,
        spendPub: spendKey.publicKey

    }

}