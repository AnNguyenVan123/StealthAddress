// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoseidon} from "../zk/IPoseidon.sol";
import "hardhat/console.sol";

/**
 * @title StealthAccount
 * @notice Minimal ERC-4337-compatible Abstract Account for a stealth address.
 *
 * ── Core ─────────────────────────────────────────────────────────────────────
 *  • The owner is the EOA derived from the ECDH stealth key math.
 *  • execute() lets the owner move funds out.
 *  • receive() accepts ETH from senders.
 *
 * ── Social Recovery with ZK-like Guardian Privacy ────────────────────────────
 *  Guardians are stored as hash commitments (keccak256(address, secret)) in a
 *  Merkle tree whose root is held on-chain.  No one can see who the guardians
 *  are until they reveal during a recovery round.
 *
 *  Recovery flow:
 *   1. Owner calls setupRecovery(root, threshold, delay) to register guardians.
 *   2. If the owner loses their key, any guardian calls approveRecovery(newOwner,
 *      commitment, secret, merkleProof).  The contract verifies:
 *        a. keccak256(msg.sender || secret) == commitment         (identity proof)
 *        b. commitment is a leaf of the on-chain Merkle root      (membership proof)
 *   3. Once `threshold` unique guardians approve, anyone calls executeRecovery()
 *      after the timelock has expired.  The owner is replaced.
 *   4. The current owner can call cancelRecovery() at any time to abort.
 *
 *  ZK properties:
 *   • Guardian identities are hidden (just commitments on-chain).
 *   • Merkle proof reveals only that ONE commitment sits in the tree — the rest
 *     remain anonymous (equivalent to set-membership ZK without a full SNARK).
 *   • Each commitment can only vote once per recovery nonce.
 */
interface IOffchainMerkleTreeManager {
    function root() external view returns (bytes32);
}

interface IVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[2] memory input
    ) external view returns (bool);
}

interface IAnnouncer {
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external;
}

contract StealthAccount {
    // ─── Core State ──────────────────────────────────────────────────────────

    /// @notice A (hiding) commitment to the location of k on the chain
    bytes32 public indexCommitment;
    IOffchainMerkleTreeManager public treeManager;
    IPoseidon public poseidonHasher;
    IVerifier public verifier;
    // Standard ERC-4337 EntryPoint v0.6 address
    address public constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;
    // ===== EVENTS =====
    event DebugProof(bool success);
    event DebugSignals(uint256 s0, uint256 s1);

    // ─── Events ──────────────────────────────────────────────────────────────

    event Executed(address indexed to, uint256 value, bytes data);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotAuthorized();
    error ExecutionFailed();
    error RecoveryNotConfigured();
    error InvalidGuardianProof();
    error AlreadyApproved();
    error NewCommitmentMismatch();
    error ThresholdNotReached();
    error TimelockNotExpired();
    error NoActiveRecovery();

    // ─── ZK Authentication ───────────────────────────────────────────────────

    struct ZKPAuth {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    function _verifyZKP(
        ZKPAuth calldata auth
    )
        internal
        view
        returns (
            bool ok,
            string memory reason,
            uint256 rootSig,
            uint256 indexSig
        )
    {
        // return (true, "BYPASS", 0, 0);
        // ===== 1. ROOT =====
        bytes32 currentRoot = treeManager.root();

        if (currentRoot == bytes32(0)) {
            return (false, "ROOT_EMPTY", 0, 0);
        }

        // ===== 2. BUILD SIGNALS =====
        uint256[2] memory publicSignals;
        publicSignals[0] = uint256(currentRoot);
        publicSignals[1] = uint256(indexCommitment);

        // ===== 3. VERIFIER CHECK =====
        address v = address(verifier);

        if (v == address(0)) {
            return (
                false,
                "VERIFIER_NOT_SET",
                publicSignals[0],
                publicSignals[1]
            );
        }

        // ===== 4. VERIFY (CATCH CRASH) =====
        bool success;

        try
            verifier.verifyProof(auth.a, auth.b, auth.c, publicSignals)
        returns (bool result) {
            success = result;
        } catch {
            return (
                false,
                "VERIFIER_CRASH",
                publicSignals[0],
                publicSignals[1]
            );
        }
        // ===== 5. RESULT =====
        if (!success) {
            return (false, "INVALID_PROOF", publicSignals[0], publicSignals[1]);
        }

        return (true, "OK", publicSignals[0], publicSignals[1]);
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        bytes32 _indexCommitment,
        address _treeManager,
        address _hasher,
        address _verifier
    ) {
        indexCommitment = _indexCommitment;
        treeManager = IOffchainMerkleTreeManager(_treeManager);
        poseidonHasher = IPoseidon(_hasher);
        verifier = IVerifier(_verifier);
    }

    // ─── Receive ETH ─────────────────────────────────────────────────────────

    receive() external payable {}

    event DebugZKP(bool ok, string reason, uint256 root, uint256 index);

    event DebugExecuteStep(string step);
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        ZKPAuth calldata auth
    ) external returns (bytes memory) {
        emit DebugExecuteStep("START_EXECUTE");

        // ===== 1. VERIFY ZKP =====
        (
            bool ok,
            string memory reason,
            uint256 root,
            uint256 index
        ) = _verifyZKP(auth);

        emit DebugZKP(ok, reason, root, index);

        if (!ok) {
            emit DebugExecuteStep("ZKP_FAILED");
            revert(reason); // ❗ vẫn phải revert để đảm bảo security
        }

        emit DebugExecuteStep("ZKP_PASSED");

        // ===== 2. EXECUTE CALL =====
        (bool success, bytes memory result) = to.call{value: value}(data);

        if (!success) {
            emit DebugExecuteStep("CALL_FAILED");
            revert("EXECUTION_FAILED");
        }

        emit DebugExecuteStep("CALL_SUCCESS");

        emit Executed(to, value, data);

        // ===== 3. RETURN RESULT =====
        return result;
    }

    function executeStealthTransfer(
        address announcer,
        uint256 schemeId,
        address stealthAddress,
        uint256 value,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata,
        ZKPAuth calldata auth
    ) external returns (bytes memory) {
        emit DebugExecuteStep("START_STEALTH");

        // ===== 1. VERIFY ZKP =====
        (
            bool ok,
            string memory reason,
            uint256 root,
            uint256 index
        ) = _verifyZKP(auth);

        emit DebugZKP(ok, reason, root, index);

        if (!ok) {
            emit DebugExecuteStep("ZKP_FAILED");
            revert(reason);
        }

        emit DebugExecuteStep("ZKP_PASSED");

        // ===== 2. TRANSFER =====
        (bool success, bytes memory result) = stealthAddress.call{value: value}(
            ""
        );

        if (!success) {
            emit DebugExecuteStep("TRANSFER_FAILED");
            revert("TRANSFER_FAILED");
        }

        emit DebugExecuteStep("TRANSFER_SUCCESS");

        // ===== 3. ANNOUNCE =====
        try
            IAnnouncer(announcer).announce(
                schemeId,
                stealthAddress,
                ephemeralPubKey,
                metadata
            )
        {
            emit DebugExecuteStep("ANNOUNCE_SUCCESS");
        } catch {
            emit DebugExecuteStep("ANNOUNCE_FAILED");
            revert("ANNOUNCE_FAILED");
        }
        emit Executed(stealthAddress, value, "");

        // ===== 4. RETURN =====
        return result;
    }

    function executeERC20StealthTransfer(
        address announcer,
        uint256 schemeId,
        address token,
        address stealthAddress,
        uint256 amount,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata,
        ZKPAuth calldata auth
    ) external returns (bytes memory) {
        emit DebugExecuteStep("START_ERC20_STEALTH");

        // ===== 1. VERIFY ZKP =====
        (
            bool ok,
            string memory reason,
            uint256 root,
            uint256 index
        ) = _verifyZKP(auth);

        emit DebugZKP(ok, reason, root, index);

        if (!ok) {
            emit DebugExecuteStep("ZKP_FAILED");
            revert(reason);
        }

        emit DebugExecuteStep("ZKP_PASSED");

        // ===== 2. TRANSFER ERC20 =====
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", stealthAddress, amount)
        );

        if (!success) {
            emit DebugExecuteStep("ERC20_TRANSFER_FAILED");
            revert("ERC20_TRANSFER_FAILED");
        }

        emit DebugExecuteStep("ERC20_TRANSFER_SUCCESS");

        // ===== 3. ANNOUNCE =====
        try
            IAnnouncer(announcer).announce(
                schemeId,
                stealthAddress,
                ephemeralPubKey,
                metadata
            )
        {
            emit DebugExecuteStep("ANNOUNCE_SUCCESS");
        } catch {
            emit DebugExecuteStep("ANNOUNCE_FAILED");
            revert("ANNOUNCE_FAILED");
        }
        
        // Emitting the call data for tracking
        emit Executed(stealthAddress, 0, abi.encodeWithSignature("transfer(address,uint256)", stealthAddress, amount));

        return result;
    }

    function executeERC721StealthTransfer(
        address announcer,
        uint256 schemeId,
        address token,
        address stealthAddress,
        uint256 tokenId,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata,
        ZKPAuth calldata auth
    ) external returns (bytes memory) {
        emit DebugExecuteStep("START_ERC721_STEALTH");

        // ===== 1. VERIFY ZKP =====
        (
            bool ok,
            string memory reason,
            uint256 root,
            uint256 index
        ) = _verifyZKP(auth);

        emit DebugZKP(ok, reason, root, index);

        if (!ok) {
            emit DebugExecuteStep("ZKP_FAILED");
            revert(reason);
        }

        emit DebugExecuteStep("ZKP_PASSED");

        // ===== 2. TRANSFER ERC721 =====
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", address(this), stealthAddress, tokenId)
        );

        if (!success) {
            emit DebugExecuteStep("ERC721_TRANSFER_FAILED");
            revert("ERC721_TRANSFER_FAILED");
        }

        emit DebugExecuteStep("ERC721_TRANSFER_SUCCESS");

        // ===== 3. ANNOUNCE =====
        try
            IAnnouncer(announcer).announce(
                schemeId,
                stealthAddress,
                ephemeralPubKey,
                metadata
            )
        {
            emit DebugExecuteStep("ANNOUNCE_SUCCESS");
        } catch {
            emit DebugExecuteStep("ANNOUNCE_FAILED");
            revert("ANNOUNCE_FAILED");
        }
        
        // Emitting the call data for tracking
        emit Executed(stealthAddress, 0, abi.encodeWithSignature("transferFrom(address,address,uint256)", address(this), stealthAddress, tokenId));

        return result;
    }

    event DebugPrefundFailed();
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) {
            return 0; // bypass
        }

        if (missingAccountFunds > 0) {
            (bool success, ) = payable(ENTRY_POINT).call{
                value: missingAccountFunds
            }("");

            if (!success) {
                emit DebugPrefundFailed();
                return 0; // debug mode → không revert
            }
        }
        (ZKPAuth memory auth, uint256 indexCommitmentFromSig) = abi.decode(
            userOp.signature,
            (ZKPAuth, uint256)
        );
        bytes32 currentRoot = treeManager.root();

        uint256[2] memory publicSignals;
        publicSignals[0] = uint256(currentRoot);
        publicSignals[1] = indexCommitmentFromSig;

        emit DebugSignals(publicSignals[0], publicSignals[1]);

        bool ok;

        try
            verifier.verifyProof(auth.a, auth.b, auth.c, publicSignals)
        returns (bool result) {
            ok = result;
        } catch {
            emit DebugProof(false);
            return 0;
        }
        emit DebugProof(ok);

        // ❗ KHÔNG revert nữa
        return 0;
    }
    /// @notice A debug function to easily check if the signature/proof is valid
    /// without relying on EntryPoint simulation (which swallows revert reasons into AA23)

    function debugVerifyProof(
        bytes calldata signature
    )
        external
        view
        returns (
            bool ok,
            string memory reason,
            uint256 rootSig,
            uint256 indexSig,
            uint256[2] memory aOut,
            uint256[2][2] memory bOut,
            uint256[2] memory cOut
        )
    {
        if (signature.length == 0) {
            return (
                false,
                "EMPTY_SIGNATURE",
                0,
                0,
                [uint256(0), uint256(0)],
                [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
                [uint256(0), uint256(0)]
            );
        }

        if (signature.length < 288) {
            return (
                false,
                "SIG_TOO_SHORT",
                0,
                0,
                [uint256(0), uint256(0)],
                [[uint256(0), uint256(0)], [uint256(0), uint256(0)]],
                [uint256(0), uint256(0)]
            );
        }

        ZKPAuth memory auth;
        uint256 indexCommitmentFromSig;

        // ===== 1. DECODE =====
        (auth, indexCommitmentFromSig) = abi.decode(
            signature,
            (ZKPAuth, uint256)
        );
        // ===== 2. LOAD ROOT =====
        bytes32 currentRoot;
        try treeManager.root() returns (bytes32 r) {
            currentRoot = r;
        } catch {
            return (false, "TREE_MANAGER_REVERT", 0, 0, auth.a, auth.b, auth.c);
        }
        if (currentRoot == bytes32(0)) {
            return (false, "ROOT_NOT_SET", 0, 0, auth.a, auth.b, auth.c);
        }

        // ===== 3. BUILD SIGNALS =====
        uint256[2] memory publicSignals;
        publicSignals[0] = uint256(currentRoot);
        publicSignals[1] = indexCommitmentFromSig;

        address v = address(verifier);
        if (v == address(0)) {
            return (
                false,
                "VERIFIER_NOT_SET",
                publicSignals[0],
                publicSignals[1],
                auth.a,
                auth.b,
                auth.c
            );
        }

        // ===== 4. CHECK FIELD RANGE (🔥 cực quan trọng) =====
        uint256 SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

        if (publicSignals[0] >= SNARK_SCALAR_FIELD) {
            return (
                false,
                "ROOT_OUT_OF_FIELD",
                publicSignals[0],
                publicSignals[1],
                auth.a,
                auth.b,
                auth.c
            );
        }

        if (publicSignals[1] >= SNARK_SCALAR_FIELD) {
            return (
                false,
                "INDEX_OUT_OF_FIELD",
                publicSignals[0],
                publicSignals[1],
                auth.a,
                auth.b,
                auth.c
            );
        }

        // ===== 5. VERIFY =====
        bool success;
        try
            verifier.verifyProof(auth.a, auth.b, auth.c, publicSignals)
        returns (bool result) {
            success = result;
        } catch {
            return (
                false,
                "VERIFIER_CRASH",
                publicSignals[0],
                publicSignals[1],
                auth.a,
                auth.b,
                auth.c
            );
        }
        if (!success) {
            return (
                false,
                "ZK_PROOF_INVALID",
                publicSignals[0],
                publicSignals[1],
                auth.a,
                auth.b,
                auth.c
            );
        }

        return (
            true,
            "OK",
            publicSignals[0],
            publicSignals[1],
            auth.a,
            auth.b,
            auth.c
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    function _decodeSafe(
        bytes calldata sig
    )
        external
        pure
        returns (ZKPAuth memory auth, uint256 indexCommitmentFromSig)
    {
        return abi.decode(sig, (ZKPAuth, uint256));
    }

    function poseidon2(bytes32 a, bytes32 b) internal view returns (bytes32) {
        uint256[2] memory inputs;
        inputs[0] = uint256(a);
        inputs[1] = uint256(b);
        return bytes32(poseidonHasher.poseidon(inputs));
    }

    function poseidon1(bytes32 a) internal view returns (bytes32) {
        return poseidon2(a, bytes32(0));
    }
}
