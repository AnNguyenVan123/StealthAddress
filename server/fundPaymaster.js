import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

async function fund() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
    const PAYMASTER = process.env.PAYMASTER_ADDRESS || '0x858c7037b66b935900289b4be316cd9a9fcd22f6';

    const entryPointAbi = ["function depositTo(address account) external payable"];
    const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, wallet);

    console.log("Funding paymaster:", PAYMASTER);
    console.log("Using EntryPoint:", ENTRY_POINT);
    try {
        const tx = await entryPoint.depositTo(PAYMASTER, { value: ethers.parseEther("0.005") });
        console.log("Tx sent:", tx.hash);
        await tx.wait();
        console.log("Successfully deposited 0.1 ETH to paymaster.");
    } catch (e) {
        console.error("Error depositing:", e);
    }
}
fund();
