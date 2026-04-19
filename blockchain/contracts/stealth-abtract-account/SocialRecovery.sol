// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIncrementalMerkleTree {
    struct ZKPAuth {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }
    function updateRoot(
        bytes32 newRoot,
        bytes32 newLeaf,
        uint32 index,
        ZKPAuth calldata auth
    ) external;
}

contract SocialRecovery {
    IIncrementalMerkleTree public treeManager;
    uint32 public mappedIndex;
    
    mapping(address => bool) public isGuardian;
    uint256 public guardianCount;
    uint256 public threshold;

    struct RecoveryRequest {
        bytes32 newRoot;
        bytes32 newLeaf;
        uint256 approvals;
        bool executed;
    }

    mapping(uint256 => RecoveryRequest) public requests;
    mapping(uint256 => mapping(address => bool)) public requestApprovals;
    uint256 public requestCount;

    event RecoveryProposed(uint256 indexed requestId, bytes32 newRoot, bytes32 newLeaf);
    event RecoveryApproved(uint256 indexed requestId, address guardian);
    event RecoveryExecuted(uint256 indexed requestId);

    constructor(
        address _treeManager,
        uint32 _mappedIndex,
        address[] memory _guardians,
        uint256 _threshold
    ) {
        require(_threshold > 0 && _threshold <= _guardians.length, "SocialRecovery: invalid threshold");
        treeManager = IIncrementalMerkleTree(_treeManager);
        mappedIndex = _mappedIndex;
        threshold = _threshold;

        for (uint256 i = 0; i < _guardians.length; i++) {
            require(_guardians[i] != address(0), "SocialRecovery: invalid guardian");
            require(!isGuardian[_guardians[i]], "SocialRecovery: duplicate guardian");
            isGuardian[_guardians[i]] = true;
        }
        guardianCount = _guardians.length;
    }

    modifier onlyGuardian() {
        require(isGuardian[msg.sender], "SocialRecovery: not a guardian");
        _;
    }

    /**
     * @notice Proposes a new leaf and root update for the stealth identity.
     */
    function proposeRecovery(bytes32 newRoot, bytes32 newLeaf) external onlyGuardian returns (uint256) {
        uint256 reqId = requestCount++;
        RecoveryRequest storage req = requests[reqId];
        req.newRoot = newRoot;
        req.newLeaf = newLeaf;
        
        emit RecoveryProposed(reqId, newRoot, newLeaf);
        
        // Auto approve for the proposer
        approveRecovery(reqId);
        return reqId;
    }

    /**
     * @notice Approves a pending recovery request.
     */
    function approveRecovery(uint256 reqId) public onlyGuardian {
        RecoveryRequest storage req = requests[reqId];
        require(!req.executed, "SocialRecovery: already executed");
        require(!requestApprovals[reqId][msg.sender], "SocialRecovery: already approved");

        requestApprovals[reqId][msg.sender] = true;
        req.approvals++;

        emit RecoveryApproved(reqId, msg.sender);
    }

    /**
     * @notice Executes the recovery updating the tree once threshold is met.
     */
    function executeRecovery(
        uint256 reqId,
        IIncrementalMerkleTree.ZKPAuth calldata auth
    ) external onlyGuardian {
        RecoveryRequest storage req = requests[reqId];
        require(!req.executed, "SocialRecovery: already executed");
        require(req.approvals >= threshold, "SocialRecovery: not enough approvals");

        req.executed = true;

        treeManager.updateRoot(req.newRoot, req.newLeaf, mappedIndex, auth);

        emit RecoveryExecuted(reqId);
    }
}
