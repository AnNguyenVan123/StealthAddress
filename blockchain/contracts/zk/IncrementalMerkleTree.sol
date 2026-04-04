// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISMTVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[2] calldata input
    ) external view returns (bool);
}

/**
 * @title IncrementalMerkleTree
 * @dev The merkle tree structure is managed off-chain by the server.
 *      This contract stores the active root hash and leaf count, updated via ZK proof
 *      verified by the SMT update circuit (smt_update.circom).
 *
 *      Public signals expected by the circuit: [oldRoot, newRoot]
 *
 *      On fresh deployment `root` is bytes32(0).  The deployer MUST call
 *      `initRoot(emptyTreeRoot)` once before any `updateRoot()` call so that
 *      the on-chain root matches the server's Poseidon empty-tree root.
 */
contract IncrementalMerkleTree {
    bytes32 public root;
    uint32 public nextIndex;
    ISMTVerifier public verifier;

    event RootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event RootInitialized(bytes32 initialRoot);

    struct ZKPAuth {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    constructor(address _verifier) {
        require(_verifier != address(0), "IncrementalMerkleTree: zero verifier");
        verifier = ISMTVerifier(_verifier);
    }

    /**
     * @notice Set the initial Poseidon empty-tree root.
     * @dev    Can only be called ONCE — while root is still bytes32(0).
     *         No caller restriction: the one-time guard is sufficient because
     *         the correct initial root is publicly computable (Poseidon zeroHash[20]).
     *
     * @param _initialRoot  The Poseidon root of the empty 20-depth binary tree
     *                      (zeroHashes[20] from PoseidonSparseMerkleTree).
     */
    function initRoot(bytes32 _initialRoot) external {
        require(root == bytes32(0), "IncrementalMerkleTree: already initialised");
        require(_initialRoot != bytes32(0), "IncrementalMerkleTree: zero root");
        root = _initialRoot;
        emit RootInitialized(_initialRoot);
    }

    /**
     * @notice Update the on-chain Merkle root using a ZK proof from smt_update.circom.
     *
     * @param newRoot  The new root after inserting/updating `leaf` at `index`.
     * @param leaf     The leaf value that was inserted/updated (private in circuit, not verified here).
     * @param index    The leaf index (tracked for nextIndex bookkeeping).
     * @param auth     Groth16 proof (a, b, c). Public signals: [oldRoot, newRoot].
     */
    function updateRoot(
        bytes32 newRoot,
        bytes32 leaf,
        uint32 index,
        ZKPAuth calldata auth
    ) external {
        _verifyUpdateZKP(newRoot, auth);

        emit RootUpdated(root, newRoot);
        root = newRoot;
        if (index >= nextIndex) {
            nextIndex = index + 1;
        }
    }

    /**
     * @dev Verifies the SMT update ZK proof.
     *      Public signals passed to verifier: [oldRoot, newRoot]
     *      which matches smt_update.circom `public [oldRoot, newRoot]`.
     */
    function _verifyUpdateZKP(
        bytes32 newRoot,
        ZKPAuth calldata auth
    ) internal view {
        uint256[2] memory publicSignals;
        publicSignals[0] = uint256(root);    // oldRoot (current on-chain root)
        publicSignals[1] = uint256(newRoot); // newRoot

        require(
            address(verifier) != address(0),
            "IncrementalMerkleTree: verifier not set"
        );
        require(
            verifier.verifyProof(auth.a, auth.b, auth.c, publicSignals),
            "IncrementalMerkleTree: invalid root update proof"
        );
    }
}
