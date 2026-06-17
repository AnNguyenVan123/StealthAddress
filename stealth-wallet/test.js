import { ethers } from "ethers";

// =====================================================
// CONFIG
// =====================================================

const RPC_URL =
    "https://eth-sepolia.g.alchemy.com/v2/1etIWmjr9JhjRIIhMMzEp";

const PRIVATE_KEY =
    "5df5b0f8772e9a94d7ed5fa9070bc39be32fde5830eb2f257ee6b8c519407b4b";

const ENS_CONTROLLER =
    "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";

// =====================================================
// ABI
// =====================================================

const CONTROLLER_ABI = [
    "function available(string label) view returns (bool)",

    "function rentPrice(string label,uint256 duration) view returns (tuple(uint256 base,uint256 premium) price)",

    "function makeCommitment(tuple(string label,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,uint8 reverseRecord,bytes32 referrer) registration) pure returns (bytes32)",

    "function commit(bytes32 commitment)",

    "function commitments(bytes32) view returns (uint256)",

    "function register(tuple(string label,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,uint8 reverseRecord,bytes32 referrer) registration) payable",

    // custom errors
    "error CommitmentTooNew(bytes32 commitment)",
    "error CommitmentTooOld(bytes32 commitment)",
    "error NameNotAvailable(string name)",
    "error DurationTooShort(uint256 duration)",
    "error ResolverRequiredWhenDataSupplied()",
    "error UnexpiredCommitmentExists(bytes32 commitment)",
    "error InsufficientValue()",
    "error Unauthorised(bytes32 node)"
];

const iface = new ethers.Interface(
    CONTROLLER_ABI
);

// =====================================================
// PROVIDER
// =====================================================

const provider =
    new ethers.JsonRpcProvider(RPC_URL);

const wallet =
    new ethers.Wallet(
        PRIVATE_KEY,
        provider
    );

const controller =
    new ethers.Contract(
        ENS_CONTROLLER,
        CONTROLLER_ABI,
        wallet
    );

// =====================================================
// REGISTRATION
// =====================================================

const registration = {
    label: "alice254",

    owner:
        await wallet.getAddress(),

    duration: 31536000n,

    secret:
        "0x07ef9ad251fff6318dd634e63c6c779c5325d1f500006432c23e446bdbed5d3f",

    resolver:
        "0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5",

    data: [],

    reverseRecord: 0,

    referrer:
        "0x0000000000000000000000000000000000000000000000000000000000000000"
};

// =====================================================
// MAIN
// =====================================================

async function main() {
    console.log(
        "=================================="
    );
    console.log(
        "ENS FULL DIAGNOSTIC"
    );
    console.log(
        "=================================="
    );

    // ---------------------------------------------------
    // Contract exists?
    // ---------------------------------------------------

    const code =
        await provider.getCode(
            ENS_CONTROLLER
        );

    console.log(
        "Code length:",
        code.length
    );

    if (code === "0x") {
        throw new Error(
            "Controller not deployed"
        );
    }

    // ---------------------------------------------------
    // Availability
    // ---------------------------------------------------

    const available =
        await controller.available(
            registration.label
        );

    console.log(
        "Available:",
        available
    );

    // ---------------------------------------------------
    // Price
    // ---------------------------------------------------

    const price =
        await controller.rentPrice(
            registration.label,
            registration.duration
        );

    const value =
        price.base +
        price.premium;

    console.log(
        "Price:",
        ethers.formatEther(value),
        "ETH"
    );

    // ---------------------------------------------------
    // Commitment
    // ---------------------------------------------------

    const commitment =
        await controller.makeCommitment(
            registration
        );

    console.log(
        "Commitment:"
    );

    console.log(
        commitment
    );

    // ---------------------------------------------------
    // Timestamp before commit
    // ---------------------------------------------------

    const beforeTs =
        await controller.commitments(
            commitment
        );

    console.log(
        "Timestamp BEFORE commit:"
    );

    console.log(
        beforeTs.toString()
    );

    // ---------------------------------------------------
    // Commit tx
    // ---------------------------------------------------

    console.log(
        "\nSending commit..."
    );

    const commitTx =
        await controller.commit(
            commitment,
            {
                maxFeePerGas: ethers.parseUnits("50", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("10", "gwei")
            }
        );

    console.log(
        "Commit tx:",
        commitTx.hash
    );

    await commitTx.wait();

    console.log(
        "Commit mined"
    );

    // ---------------------------------------------------
    // Timestamp after commit
    // ---------------------------------------------------

    const afterTs =
        await controller.commitments(
            commitment
        );

    console.log(
        "Timestamp AFTER commit:"
    );

    console.log(
        afterTs.toString()
    );

    // ---------------------------------------------------
    // Wait 70 seconds
    // ---------------------------------------------------

    console.log(
        "\nWaiting 70 seconds..."
    );

    await new Promise(
        (r) =>
            setTimeout(
                r,
                70000
            )
    );

    console.log(
        "Wait complete"
    );

    // ---------------------------------------------------
    // Static register
    // ---------------------------------------------------

    try {
        console.log(
            "\nRunning static register..."
        );

        await controller.register.staticCall(
            registration,
            {
                value
            }
        );

        console.log(
            "✅ STATIC CALL SUCCESS"
        );
    } catch (err) {
        console.log(
            "❌ STATIC CALL FAILED"
        );

        let revertData =
            err.data ||
            err.error?.data ||
            err.info?.error?.data;

        console.log(
            "Revert data:"
        );

        console.log(
            revertData
        );

        if (
            revertData &&
            typeof revertData ===
            "string"
        ) {
            try {
                const decoded =
                    iface.parseError(
                        revertData
                    );

                console.log(
                    "\nDecoded error:"
                );

                console.log(
                    decoded.name
                );

                console.log(
                    decoded.args
                );
            } catch {
                console.log(
                    "Unable to decode"
                );
            }
        }
    }

    // ---------------------------------------------------
    // Gas estimate
    // ---------------------------------------------------

    try {
        const gas =
            await controller.register.estimateGas(
                registration,
                {
                    value
                }
            );

        console.log(
            "\nEstimated gas:"
        );

        console.log(
            gas.toString()
        );
    } catch (err) {
        console.log(
            "\nGas estimation failed:"
        );

        console.log(err);
    }

    console.log(
        "\nDONE"
    );
}

main().catch(console.error);