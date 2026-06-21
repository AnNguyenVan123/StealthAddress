import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("=================================");
    console.log("PAYMASTER DEPOSIT DEBUG");
    console.log("=================================");

    const CUSTOM_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(CUSTOM_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Network
    const network = await provider.getNetwork();

    console.log("\nNETWORK");
    console.log("Chain ID:", network.chainId.toString());
    console.log("Name:", network.name);

    // Wallet
    console.log("\nWALLET");
    console.log("Address:", wallet.address);

    const balance = await provider.getBalance(wallet.address);

    console.log(
        "Balance:",
        ethers.formatEther(balance),
        "ETH"
    );

    // Nonce check
    const latestNonce =
        await provider.getTransactionCount(
            wallet.address,
            "latest"
        );

    const pendingNonce =
        await provider.getTransactionCount(
            wallet.address,
            "pending"
        );

    console.log("\nNONCES");
    console.log("Latest :", latestNonce);
    console.log("Pending:", pendingNonce);

    if (pendingNonce > latestNonce) {
        console.log(
            "\n⚠ WARNING: There are pending transactions."
        );
        console.log(
            "A previous nonce may be blocking this transaction."
        );
    }

    // Fee data
    const feeData = await provider.getFeeData();

    console.log("\nFEE DATA");

    if (feeData.gasPrice) {
        console.log(
            "gasPrice:",
            ethers.formatUnits(
                feeData.gasPrice,
                "gwei"
            ),
            "gwei"
        );
    }

    if (feeData.maxFeePerGas) {
        console.log(
            "maxFeePerGas:",
            ethers.formatUnits(
                feeData.maxFeePerGas,
                "gwei"
            ),
            "gwei"
        );
    }

    if (feeData.maxPriorityFeePerGas) {
        console.log(
            "maxPriorityFeePerGas:",
            ethers.formatUnits(
                feeData.maxPriorityFeePerGas,
                "gwei"
            ),
            "gwei"
        );
    }

    const paymasterAbi = [
        "function deposit() payable"
    ];

    const paymaster = new ethers.Contract(
        PAYMASTER_ADDRESS,
        paymasterAbi,
        wallet
    );

    const depositAmount =
        ethers.parseEther("0.03");

    console.log(
        "\nDeposit Amount:",
        ethers.formatEther(depositAmount),
        "ETH"
    );

    // Estimate gas
    console.log("\nESTIMATING GAS");

    const gasEstimate =
        await paymaster.deposit.estimateGas({
            value: depositAmount
        });

    console.log(
        "Estimated Gas:",
        gasEstimate.toString()
    );

    // Send tx
    console.log("\nSENDING TRANSACTION");

    const tx = await paymaster.deposit({
        value: depositAmount,
        gasLimit: (gasEstimate * 120n) / 100n
    });

    console.log("Hash :", tx.hash);
    console.log("Nonce:", tx.nonce);

    // Verify tx exists
    const txInfo =
        await provider.getTransaction(tx.hash);

    console.log(
        "\nTX EXISTS:",
        txInfo ? "YES" : "NO"
    );

    console.log("\nSTART POLLING...");

    let receipt = null;

    for (let i = 1; i <= 60; i++) {

        receipt =
            await provider.getTransactionReceipt(
                tx.hash
            );

        const currentTx =
            await provider.getTransaction(
                tx.hash
            );

        console.log(
            `\nAttempt ${i}`
        );

        console.log(
            "blockNumber:",
            currentTx?.blockNumber
        );

        console.log(
            "receipt:",
            receipt
                ? "FOUND"
                : "PENDING"
        );

        if (receipt) {
            break;
        }

        await sleep(5000);
    }

    console.log(
        "\n================================="
    );

    if (!receipt) {
        console.log(
            "❌ Transaction still pending after 5 minutes"
        );

        const latestNonceAfter =
            await provider.getTransactionCount(
                wallet.address,
                "latest"
            );

        const pendingNonceAfter =
            await provider.getTransactionCount(
                wallet.address,
                "pending"
            );

        console.log(
            "Latest Nonce:",
            latestNonceAfter
        );

        console.log(
            "Pending Nonce:",
            pendingNonceAfter
        );

        console.log(
            "\nPossible reasons:"
        );

        console.log(
            "1. Previous nonce is stuck."
        );

        console.log(
            "2. Gas price too low."
        );

        console.log(
            "3. RPC synchronization issue."
        );

        return;
    }

    console.log(
        "✅ RECEIPT FOUND"
    );

    console.log(
        "Block Number:",
        receipt.blockNumber
    );

    console.log(
        "Status:",
        receipt.status
    );

    console.log(
        "Gas Used:",
        receipt.gasUsed.toString()
    );

    console.log(
        "Transaction Index:",
        receipt.index
    );

    if (receipt.status === 1n) {
        console.log(
            "\n✅ SUCCESS"
        );
    } else {
        console.log(
            "\n❌ REVERTED"
        );
    }

    const finalBalance =
        await provider.getBalance(
            wallet.address
        );

    console.log(
        "\nFinal Balance:",
        ethers.formatEther(finalBalance),
        "ETH"
    );

    console.log(
        "\n================================="
    );
}

main().catch(err => {
    console.error("\nERROR:");
    console.error(err);

    if (err.shortMessage) {
        console.error(
            "\nShort Message:",
            err.shortMessage
        );
    }

    if (err.reason) {
        console.error(
            "\nReason:",
            err.reason
        );
    }

    if (err.code) {
        console.error(
            "\nCode:",
            err.code
        );
    }
});