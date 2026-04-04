import { ethers } from "ethers"

export const ERC20_ABI = [

    "function balanceOf(address) view returns(uint256)"

]

export async function getTokenBalance(
    provider,
    token,
    address
) {

    const contract =
        new ethers.Contract(
            token,
            ERC20_ABI,
            provider
        )

    return contract.balanceOf(address)

}