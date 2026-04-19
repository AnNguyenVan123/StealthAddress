export const stealthAccountFactoryAbi = [
    "function deployFor(bytes32 indexCommitment) returns (address account)",
    "function getAddress(bytes32 indexCommitment) view returns (address)",
    "function treeManager() view returns (address)",
    "function poseidonHasher() view returns (address)",
    "function verifier() view returns (address)",
    "event StealthAccountDeployed(bytes32 indexed indexCommitment, address indexed accountAddress)"
]
