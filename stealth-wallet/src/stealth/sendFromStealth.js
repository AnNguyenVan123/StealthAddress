import { ethers } from "ethers"

const RPC = import.meta.env.VITE_RPC_URL;

const provider =
    new ethers.JsonRpcProvider(RPC)

export async function sendFromStealth({

    privateKey,
    to,
    amount

}) {

    const wallet =
        new ethers.Wallet(
            privateKey,
            provider
        )

    const tx =
        await wallet.sendTransaction({

            to,
            value:
                ethers.parseUnits(amount, 0)

        })

    await tx.wait()

    return tx.hash

}