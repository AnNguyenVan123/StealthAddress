export const stealthAccountAbi = [

    "function owner() view returns (address)",

    "function execute(address to, uint256 value, bytes calldata data) returns (bytes memory)",

    "function validateUserOp(bytes32 userOpHash, bytes calldata signature, uint256 missingAccountFunds) view returns (uint256 validationData)",

    "event Executed(address indexed to, uint256 value, bytes data)",

    "receive() external payable"

]
