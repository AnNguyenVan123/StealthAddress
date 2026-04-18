// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { StealthAccount } from "./StealthAccount.sol";

/**
 * @title StealthAccountFactory
 * @notice CREATE2 factory that deploys a StealthAccount for every new stealth address.
 * @dev Address derivation follows CREATE2:
 *      address = f(factory, salt=indexCommitment, keccak256(bytecode(indexCommitment))).
 *      Idempotent: calling deployFor() twice with same indexCommitment
 *      returns the existing contract.
 */
contract StealthAccountFactory {

    // ─── State & Constructor ─────────────────────────────────────────────────
    
    address public immutable treeManager;
    address public immutable poseidonHasher;
    address public immutable verifier;

    constructor(address _treeManager, address _hasher, address _verifier) {
        treeManager = _treeManager;
        poseidonHasher = _hasher;
        verifier = _verifier;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    /// @notice Emitted when a new StealthAccount is deployed
    event StealthAccountDeployed(
        bytes32 indexed indexCommitment,
        address indexed accountAddress
    );

    // ─── Core: Deploy ────────────────────────────────────────────────────────

    /**
     * @notice Deploy (or return existing) a StealthAccount for a given indexCommitment.
     *
     * @param indexCommitment  The ZK hiding commitment.
     * @return account         The deployed StealthAccount contract address.
     */
    function deployFor(bytes32 indexCommitment) external returns (address account) {
        bytes32 salt = indexCommitment;

        bytes memory bytecode = _creationBytecode(indexCommitment);

        bytes32 bytecodeHash = keccak256(bytecode);

        account = _computeAddress(salt, bytecodeHash);

        // Already deployed — return existing
        if (account.code.length > 0) {
            return account;
        }

        // Deploy with CREATE2
        assembly {
            account := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        require(account != address(0), "StealthAccountFactory: deploy failed");

        emit StealthAccountDeployed(indexCommitment, account);
    }

    // ─── Core: Compute counterfactual address ────────────────────────────────

    /**
     * @notice Compute the StealthAccount address for a given commitment
     *         without deploying it.
     *
     * @param indexCommitment The ZK hiding commitment.
     * @return                The counterfactual contract address.
     */
    function getAddress(bytes32 indexCommitment) external view returns (address) {
        bytes32 salt = indexCommitment;

        bytes32 bytecodeHash = keccak256(_creationBytecode(indexCommitment));

        return _computeAddress(salt, bytecodeHash);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _creationBytecode(bytes32 indexCommitment) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(StealthAccount).creationCode,
            abi.encode(indexCommitment, treeManager, poseidonHasher, verifier)
        );
    }

    function _computeAddress(
        bytes32 salt,
        bytes32 bytecodeHash
    ) internal view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            bytecodeHash
                        )
                    )
                )
            )
        );
    }
}
