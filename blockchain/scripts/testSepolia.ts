import { network } from "hardhat";

import { network } from "hardhat";

async function main() {

  // kết nối network sepolia
  const { ethers } = await network.connect("sepolia");

  console.log("Connected to Sepolia");

  // lấy block hiện tại
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("Current block:", blockNumber);

  // lấy signer
  const [signer] = await ethers.getSigners();
  console.log("Using wallet:", signer.address);

  // kiểm tra balance
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // gửi transaction test
  console.log("Sending test transaction...");

  const tx = await signer.sendTransaction({
    to: signer.address,
    value: 1n
  });

  console.log("Transaction hash:", tx.hash);

  await tx.wait();

  console.log("Transaction confirmed");

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
