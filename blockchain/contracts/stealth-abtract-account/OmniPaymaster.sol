// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEntryPoint {
    function depositTo(address account) external payable;
}

contract OmniPaymaster {
    address public immutable entryPoint;

    constructor(address _entryPoint) {
        entryPoint = _entryPoint;
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

    function validatePaymasterUserOp(
        UserOperation calldata /*userOp*/,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) external view returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Not entry point");
        return ("", 0); // valid
    }

    function postOp(
        uint8 /*mode*/,
        bytes calldata /*context*/,
        uint256 /*actualGasCost*/,
        uint256 /*actualUserOpFeePerGas*/
    ) external {
        revert("PostOp should not be called with empty context");
    }

    receive() external payable {}

    function deposit() public payable {
        IEntryPoint(entryPoint).depositTo{value: msg.value}(address(this));
    }
}
