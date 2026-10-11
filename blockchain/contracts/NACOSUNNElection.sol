// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @notice Records ballot commitments without publishing ballot selections.
/// @dev Voter eligibility and one-ballot-per-voter enforcement remain off-chain.
contract NACOSUNNElection {
    address public electionAuthority;
    bool public electionActive;

    mapping(bytes32 => bool) public submissionRecorded;
    mapping(bytes32 => bytes32) public ballotCommitments;

    event BallotCommitted(
        bytes32 indexed submissionId,
        bytes32 commitment,
        uint256 timestamp
    );

    event ElectionStatusChanged(bool active);

    modifier onlyAuthority() {
        require(msg.sender == electionAuthority, "Not authorized");
        _;
    }

    constructor() {
        electionAuthority = msg.sender;
        electionActive = false;
    }

    function setElectionActive(bool active) external onlyAuthority {
        electionActive = active;
        emit ElectionStatusChanged(active);
    }

    function recordBallot(
        bytes32 submissionId,
        bytes32 commitment
    ) external onlyAuthority {
        require(electionActive, "Election is not active");
        require(submissionId != bytes32(0), "Invalid submission ID");
        require(commitment != bytes32(0), "Invalid commitment");
        require(!submissionRecorded[submissionId], "Submission already recorded");

        submissionRecorded[submissionId] = true;
        ballotCommitments[submissionId] = commitment;

        emit BallotCommitted(submissionId, commitment, block.timestamp);
    }
}
