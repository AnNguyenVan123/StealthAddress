// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISMTVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external view returns (bool);
}

/**
 * @title IncrementalMerkleTree
 * @dev The merkle tree structure is managed off-chain by the server.
 *      This contract stores the active root hash and leaf count, updated via ZK proof
 *      verified by the SMT update circuit (smt_update.circom).
 *
 *      Public signals expected by the circuit: [oldRoot, newRoot, index, newLeaf]
 *
 *      On fresh deployment `root` is bytes32(0).  The deployer MUST call
 *      `initRoot(emptyTreeRoot)` once before any `updateRoot()` call so that
 *      the on-chain root matches the server's Poseidon empty-tree root.
 */
contract IncrementalMerkleTree {
    bytes32 public root;
    uint32 public nextIndex;
    ISMTVerifier public verifier;

    mapping(uint32 => address) public socialContractMap;

    event RootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event RootInitialized(bytes32 initialRoot);
    event SocialContractRegistered(uint32 indexed index, address indexed socialContract);

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
     */
    function initRoot(bytes32 _initialRoot) external {
        require(root == bytes32(0), "IncrementalMerkleTree: already initialised");
        require(_initialRoot != bytes32(0), "IncrementalMerkleTree: zero root");
        root = _initialRoot;
        emit RootInitialized(_initialRoot);
    }

    /**
     * @notice Register a Social Recovery Contract for a specific index.
     * @dev Simple trust model: can only be registered once. In production, 
     *      this should require a signature from the leaf owner or be done at account creation.
     */
    function registerSocialContract(uint32 index, address socialContract) external {
        require(socialContractMap[index] == address(0), "IncrementalMerkleTree: already registered");
        socialContractMap[index] = socialContract;
        emit SocialContractRegistered(index, socialContract);
    }

    /**
     * @notice Update the on-chain Merkle root using a ZK proof from smt_update.circom.
     *
     * @param newRoot  The new root after inserting/updating `newLeaf` at `index`.
     * @param newLeaf  The leaf value that was inserted/updated.
     * @param index    The leaf index (tracked for nextIndex bookkeeping).
     * @param auth     Groth16 proof (a, b, c). Public signals: [oldRoot, newRoot, index, newLeaf].
     */
    function updateRoot(
        bytes32 newRoot,
        bytes32 newLeaf,
        uint32 index,
        ZKPAuth calldata auth
    ) external {
        // Enforce social recovery logic if this is an update to an existing leaf
        if (index < nextIndex) {
            require(socialContractMap[index] != address(0), "IncrementalMerkleTree: social contract not setup");
            require(msg.sender == socialContractMap[index], "IncrementalMerkleTree: unauthorized update");
        }

        _verifyUpdateZKP(newRoot, newLeaf, index, auth);

        emit RootUpdated(root, newRoot);
        root = newRoot;
        if (index >= nextIndex) {
            nextIndex = index + 1;
        }
    }

    /**
     * @dev Verifies the SMT update ZK proof.
     *      Public signals passed to verifier: [oldRoot, newRoot, index, newLeaf]
     *      which matches smt_update.circom `public [oldRoot, newRoot, index, newLeaf]`.
     */
    function _verifyUpdateZKP(
        bytes32 newRoot,
        bytes32 newLeaf,
        uint32 index,
        ZKPAuth calldata auth
    ) internal view {
        uint256[4] memory publicSignals;
        publicSignals[0] = uint256(root);    // oldRoot (current on-chain root)
        publicSignals[1] = uint256(newRoot); // newRoot
        publicSignals[2] = uint256(index);   // index
        publicSignals[3] = uint256(newLeaf); // newLeaf

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
