// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPoseidon {
    function poseidon(uint256[2] memory input) external view returns (uint256);
}
