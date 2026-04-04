export const stealthAccountFactoryAbi = [
    "function deployFor(bytes32 indexCommitment) returns (address account)",
    "function getAddress(bytes32 indexCommitment) view returns (address)",
    "event StealthAccountDeployed(bytes32 indexed indexCommitment, address indexed accountAddress)"
]
