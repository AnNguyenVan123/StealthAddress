import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { ABI } from '../abis/index.js';

dotenv.config();

export const RPC_URL = process.env.RPC_URL;
export const PRIVATE_KEY = process.env.PRIVATE_KEY;
export const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
export const PORT = process.env.PORT || 3000;
export const LEAVES_FILE = process.env.LEAVES_FILE || './leaves.json';

// ERC-4337 EntryPoint v0.6 (canonical on all networks)
export const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Validate critical env vars
if (!RPC_URL) {
    console.warn('[⚠️] WARNING: RPC_URL not set in .env.');
}
if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
    console.warn('[⚠️] WARNING: PRIVATE_KEY or CONTRACT_ADDRESS not set in .env.');
}

export const provider = new ethers.JsonRpcProvider(RPC_URL);

export let signer = null;
export let contract = null;

if (PRIVATE_KEY && CONTRACT_ADDRESS) {
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
}
