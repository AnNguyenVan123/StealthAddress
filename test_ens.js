const { ethers } = require("ethers");

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"; // Sepolia RPC
const ENS_CONTROLLER = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";

const CONTROLLER_ABI = [
    "function rentPrice(string label, uint256 duration) view returns (tuple(uint256 base, uint256 premium) price)",
    "function rentPrice(string label, uint256 duration) view returns (uint256)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const controller = new ethers.Contract(ENS_CONTROLLER, CONTROLLER_ABI, provider);
    
    try {
        console.log("Trying to get price as struct...");
        const c1 = new ethers.Contract(ENS_CONTROLLER, ["function rentPrice(string label, uint256 duration) view returns (tuple(uint256 base, uint256 premium) price)"], provider);
        const p1 = await c1.rentPrice("alicereal123qe", 31536000);
        console.log("Struct price:", p1);
    } catch (e) {
        console.error("Struct failed:", e.message);
    }
    
    try {
        console.log("Trying to get price as uint256...");
        const c2 = new ethers.Contract(ENS_CONTROLLER, ["function rentPrice(string label, uint256 duration) view returns (uint256)"], provider);
        const p2 = await c2.rentPrice("alicereal123qe", 31536000);
        console.log("Uint256 price:", p2);
    } catch (e) {
        console.error("Uint256 failed:", e.message);
    }
}

main().catch(console.error);
