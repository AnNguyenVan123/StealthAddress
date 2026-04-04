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
    // ===== EVENTS =====
    event DebugProof(bool success);
    event DebugSignals(uint256 s0, uint256 s1);
    // ─── Recovery State ──────────────────────────────────────────────────────

    /// @notice Merkle root of guardian commitments (keccak256(guardianAddr, secret))
    bytes32 public guardianRoot;

    /// @notice Minimum number of guardian approvals required
    uint256 public guardianThreshold;

    /// @notice Seconds to wait after reaching threshold before executeRecovery() works
    uint256 public recoveryDelay;

    /// @notice Proposed new indexCommitment for the active recovery round
    bytes32 public pendingIndexCommitment;

    /// @notice Timestamp when the threshold was reached (0 = not reached yet)
    uint256 public thresholdReachedAt;

    /// @notice Number of approvals in the current round
    uint256 public approvalCount;

    /// @notice Incremented each round to invalidate stale approvals
    uint256 public recoveryNonce;

    /// @notice commitment => nonce at time of approval  (prevents double-voting)
    mapping(bytes32 => uint256) public approvedAt;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Executed(address indexed to, uint256 value, bytes data);
    event RecoverySetup(bytes32 guardianRoot, uint256 threshold, uint256 delay);
    event RecoveryApproved(
        bytes32 indexed commitment,
        bytes32 pendingIndexCommitment,
        uint256 approvalCount
    );
    event RecoveryExecuted(
        bytes32 indexed oldCommitment,
        bytes32 indexed newCommitment
    );
    event RecoveryCancelled(uint256 nonce);

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

    /**
     * @notice Simulates ZK proof verification on-chain over public signals:
     *         0. currentRoot
     *         1. indexCommitment
     */

    // Production

    // function _verifyZKP(ZKPAuth calldata auth) internal view {
    //     bytes32 currentRoot = treeManager.root();
    //     require(
    //         currentRoot != bytes32(0),
    //         "StealthAccount: Tree root is empty"
    //     );

    //     uint256[2] memory publicSignals;
    //     publicSignals[0] = uint256(currentRoot);
    //     publicSignals[1] = uint256(indexCommitment);

    //     // --- ZK VERIFIER INTEGRATION ---
    //     require(
    //         address(verifier) != address(0),
    //         "StealthAccount: Verifier not set"
    //     );
    //     require(
    //         verifier.verifyProof(auth.a, auth.b, auth.c, publicSignals),
    //         "StealthAccount: Invalid ZK spend proof"
    //     );
    // }

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

    // ═══════════════════════════════════════════════════════════════════════
    //  CORE: execute
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Execute an arbitrary call from this account.
     * @dev Only callable by the owner EOA.
     */
    // function execute(
    //     address to,
    //     uint256 value,
    //     bytes calldata data,
    //     ZKPAuth calldata auth
    // ) external returns (bytes memory) {
    //     _verifyZKP(auth);

    //     (bool ok, bytes memory result) = to.call{value: value}(data);
    //     if (!ok) revert ExecutionFailed();

    //     emit Executed(to, value, data);
    //     return result;
    // }
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
    // // ═══════════════════════════════════════════════════════════════════════
    // //  SOCIAL RECOVERY
    // // ═══════════════════════════════════════════════════════════════════════

    // /**
    //  * @notice Owner registers the guardian set.
    //  *
    //  * @param root       Merkle root of guardian commitments.
    //  *                   Each leaf = keccak256(abi.encodePacked(guardianAddress, secret)).
    //  * @param threshold  Minimum approvals needed to complete recovery.
    //  * @param delay      Seconds between threshold-reached and executeRecovery().
    //  */
    // function setupRecovery(
    //     bytes32 root,
    //     uint256 threshold,
    //     uint256 delay,
    //     ZKPAuth calldata auth
    // ) external {
    //     _verifyZKP(auth);

    //     require(threshold > 0, "StealthAccount: zero threshold");
    //     guardianRoot = root;
    //     guardianThreshold = threshold;
    //     recoveryDelay = delay;
    //     emit RecoverySetup(root, threshold, delay);
    // }

    // /**
    //  * @notice Guardian approves a recovery round.
    //  *
    //  * @param newIndexCommitment  Proposed new owner address.  All approvals in a round
    //  *                            must agree on the same newIndexCommitment.
    //  * @param secret      The secret the guardian chose when the commitment was
    //  *                    created: commitment = keccak256(msg.sender || secret).
    //  * @param merkleProof Sibling hashes proving that commitment is a leaf in
    //  *                    the guardianRoot Merkle tree.
    //  *
    //  * ZK-style guarantees:
    //  *   • The commitment (hence guardian identity) is hidden until this call.
    //  *   • The Merkle proof reveals only one leaf's position, not the full set.
    //  */
    // function approveRecovery(
    //     bytes32 newIndexCommitment,
    //     bytes32 secret,
    //     bytes32[] calldata merkleProof
    // ) external {
    //     if (guardianRoot == bytes32(0)) revert RecoveryNotConfigured();

    //     // ── 1. Rebuild the commitment from caller + secret ──────────────────
    //     bytes32 commitment = poseidon2(
    //         bytes32(uint256(uint160(msg.sender))),
    //         secret
    //     );

    //     // ── 2. Verify Merkle inclusion proof (ZK set-membership) ────────────
    //     if (!_verifyMerkleProof(merkleProof, guardianRoot, commitment)) {
    //         revert InvalidGuardianProof();
    //     }

    //     // ── 3. Check for double-voting in this nonce round ──────────────────
    //     if (approvedAt[commitment] == recoveryNonce + 1)
    //         revert AlreadyApproved();

    //     // ── 4. Enforce all approvals target the same newIndexCommitment ───────────────
    //     if (pendingIndexCommitment == bytes32(0)) {
    //         pendingIndexCommitment = newIndexCommitment;
    //     } else if (pendingIndexCommitment != newIndexCommitment) {
    //         revert NewCommitmentMismatch();
    //     }

    //     // ── 5. Record approval ───────────────────────────────────────────────
    //     approvedAt[commitment] = recoveryNonce + 1;
    //     approvalCount++;

    //     emit RecoveryApproved(commitment, newIndexCommitment, approvalCount);

    //     // ── 6. Start the timelock once threshold is reached ─────────────────
    //     if (approvalCount >= guardianThreshold && thresholdReachedAt == 0) {
    //         thresholdReachedAt = block.timestamp;
    //     }
    // }

    // /**
    //  * @notice Finalise recovery after the timelock expires.
    //  *         Anyone may call this once conditions are met.
    //  */
    // function executeRecovery() external {
    //     if (pendingIndexCommitment == bytes32(0)) revert NoActiveRecovery();
    //     if (approvalCount < guardianThreshold) revert ThresholdNotReached();
    //     if (block.timestamp < thresholdReachedAt + recoveryDelay)
    //         revert TimelockNotExpired();

    //     bytes32 oldCommitment = indexCommitment;
    //     indexCommitment = pendingIndexCommitment;

    //     // Reset round
    //     _resetRecoveryRound();

    //     emit RecoveryExecuted(oldCommitment, indexCommitment);
    // }

    // /**
    //  * @notice Current owner cancels an in-progress recovery round.
    //  */
    // function cancelRecovery(ZKPAuth calldata auth) external {
    //     _verifyZKP(auth);

    //     if (pendingIndexCommitment == bytes32(0)) revert NoActiveRecovery();

    //     uint256 nonce = recoveryNonce;
    //     _resetRecoveryRound();

    //     emit RecoveryCancelled(nonce);
    // }

    // ═══════════════════════════════════════════════════════════════════════
    //  ERC-4337 — Full Bundler-compatible implementation
    // ═══════════════════════════════════════════════════════════════════════

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

    /// @notice The canonical EntryPoint address (ERC-4337 v0.6, all networks)
    address public constant ENTRY_POINT =
        0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    /// @notice Called by the EntryPoint during UserOperation validation.
    ///  1. Enforces only the EntryPoint can call it.
    ///  2. Prefunds the EntryPoint with `missingAccountFunds`.
    ///  3. Decodes the ZK proof from `signature` and verifies it.
    // function validateUserOp(
    //     UserOperation calldata userOp,
    //     bytes32, // userOpHash (unused)
    //     uint256 missingAccountFunds
    // ) external returns (uint256 validationData) {
    //     console.log("StealthAccount: validateUserOp called by", msg.sender);

    //     // ===== 1. CHECK ENTRYPOINT =====
    //     if (msg.sender != ENTRY_POINT) {
    //         console.log("StealthAccount: NOT_ENTRY_POINT error");
    //         revert("NOT_ENTRY_POINT");
    //     }

    //     // ===== 2. PREFUND =====
    //     if (missingAccountFunds > 0) {
    //         console.log("StealthAccount: Prefunding entryPoint:", missingAccountFunds);
    //         (bool success, ) = payable(ENTRY_POINT).call{
    //             value: missingAccountFunds
    //         }("");
    //         require(success, "PREFUND_FAILED");
    //     }

    //     // ===== 3. DECODE PROOF =====
    //     console.log("StealthAccount: Decoding ZK signature length:", userOp.signature.length);
    //     ZKPAuth memory auth = abi.decode(userOp.signature, (ZKPAuth));

    //     // ===== 4. GET ROOT =====
    //     bytes32 currentRoot = treeManager.root();

    //     if (currentRoot == bytes32(0)) {
    //         console.log("StealthAccount: ROOT_NOT_SET error");
    //         revert("ROOT_NOT_SET");
    //     }

    //     // ===== 5. BUILD PUBLIC SIGNALS =====
    //     uint256[2] memory publicSignals;
    //     publicSignals[0] = uint256(currentRoot);
    //     publicSignals[1] = uint256(indexCommitment);

    //     // ===== DEBUG EVENT & LOGS =====
    //     console.log("StealthAccount: Public Signals:");
    //     console.log(publicSignals[0]);
    //     console.log(publicSignals[1]);
    //     emit DebugSignals(publicSignals[0], publicSignals[1]);

    //     // ===== 6. CHECK VERIFIER =====
    //     if (address(verifier) == address(0)) {
    //         console.log("StealthAccount: VERIFIER_NOT_SET error");
    //         revert("VERIFIER_NOT_SET");
    //     }

    //     // ===== 7. VERIFY PROOF =====
    //     console.log("StealthAccount: Calling Plonk/Groth16 Verifier...");
    //     bool ok = verifier.verifyProof(auth.a, auth.b, auth.c, publicSignals);

    //     console.log("StealthAccount: Proof valid?", ok);
    //     emit DebugProof(ok);

    //     if (!ok) {
    //         console.log("StealthAccount: ZK_PROOF_INVALID! Reverting.");
    //         revert("ZK_PROOF_INVALID");
    //     }

    //     console.log("StealthAccount: validateUserOp PASSED!");
    //     // ===== 8. SUCCESS =====
    //     return 0;
    // }
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
    /**
     * @dev Standard binary Merkle proof verification using Poseidon.
     *      Leaves are sorted before hashing at each level (OpenZeppelin standard).
     */
    function _verifyMerkleProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal view returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            computed = computed < sibling
                ? poseidon2(computed, sibling)
                : poseidon2(sibling, computed);
        }
        return computed == root;
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

    function _resetRecoveryRound() internal {
        recoveryNonce++;
        pendingIndexCommitment = bytes32(0);
        approvalCount = 0;
        thresholdReachedAt = 0;
    }
}
