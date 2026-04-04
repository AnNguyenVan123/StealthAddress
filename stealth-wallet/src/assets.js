import { ethers } from "ethers"
import { NETWORKS } from "./networks"

export async function getAssets(addresses, network) {

    const provider =
        new ethers.JsonRpcProvider(NETWORKS[network].rpc)

    let total = 0n

    for (const addr of addresses) {

        const bal =
            await provider.getBalance(addr)

        total += bal

    }

    return total

}