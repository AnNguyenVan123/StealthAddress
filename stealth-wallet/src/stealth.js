import { ethers } from "ethers"

export function createAccount() {

    const scan = ethers.Wallet.createRandom()
    const spend = ethers.Wallet.createRandom()

    return {

        scanPriv: scan.privateKey,
        scanPub: scan.publicKey,

        spendPriv: spend.privateKey,
        spendPub: spend.publicKey

    }

}

export function getMetaAddress(account) {

    return {

        K: account.spendPub,
        V: account.scanPub

    }

}