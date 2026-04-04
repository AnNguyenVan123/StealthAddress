// ABI for IncrementalMerkleTree (OffchainMerkleTreeManager)
export const ABI = [
    'function updateRoot(bytes32 newRoot, bytes32 leaf, uint32 index, tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) auth) external',
    'function root() external view returns (bytes32)',
    'function initRoot(bytes32 _initialRoot) external',
];

// ABI for Stealth Account operations
export const stealthABI = [
    'function validateUserOp(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256)',
    'function debugVerifyProof(bytes calldata signature) external view returns (bool ok, string memory reason, uint256 rootSig, uint256 indexSig)',
    'function execute(address to, uint256 value, bytes calldata data, tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) auth) external returns (bytes)',
    'function executeStealthTransfer(address announcer, uint256 schemeId, address stealthAddress, uint256 value, bytes calldata ephemeralPubKey, bytes calldata metadata, tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) auth) external returns (bytes)',
    'error ExecutionFailed()',
];

// ABI for Stealth Account Factory
export const factoryABI = [
    'function deployFor(bytes32 indexCommitment) external returns (address)',
    'function getAddress(bytes32 indexCommitment) external view returns (address)',
];

// ABI for ERC-5564 Announcer
export const announcerABI = [
    'function announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata) external',
];

// ABI for ERC-4337 EntryPoint v0.6
export const entryPointABI = [
    'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address payable beneficiary) external',
    'function getNonce(address sender, uint192 key) external view returns (uint256)',
];
