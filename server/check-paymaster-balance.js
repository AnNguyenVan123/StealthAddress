import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const CUSTOM_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(CUSTOM_RPC);
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function main() {
    console.log("=================================");
    console.log("PAYMASTER BALANCE CHECK");
    console.log("=================================");
    console.log(`Paymaster Address: ${PAYMASTER_ADDRESS}`);
    console.log(`EntryPoint Address: ${ENTRY_POINT_ADDRESS}`);

    // 1. Check native ETH balance of the Paymaster contract
    const nativeBalance = await provider.getBalance(PAYMASTER_ADDRESS);
    console.log(`\n1. Native ETH Balance (in Paymaster Contract): ${ethers.formatEther(nativeBalance)} ETH`);

    // 2. Check Deposit Balance in the EntryPoint contract
    const entryPointAbi = [
        "function balanceOf(address account) external view returns (uint256)",
        "function getDepositInfo(address account) external view returns (tuple(uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime))"
    ];
    const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, provider);
    
    try {
        const depositInfo = await entryPoint.getDepositInfo(PAYMASTER_ADDRESS);
        console.log(`2. EntryPoint Deposit (usable for gas): ${ethers.formatEther(depositInfo.deposit)} ETH`);
    } catch (e) {
        // Fallback to balanceOf if getDepositInfo fails
        const deposit = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
        console.log(`2. EntryPoint Deposit (usable for gas): ${ethers.formatEther(deposit)} ETH`);
    }
}

main().catch(console.error);
