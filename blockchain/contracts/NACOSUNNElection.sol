// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @notice Stores ballot hashes during an election.
/// @dev It does not count votes or check voter eligibility. Hashes are public.
contract NACOSUNNElection {
    /// @notice Account that controls the election.
    address public electionAuthority;

    /// @notice Whether ballot submissions are open.
    bool public electionActive;

    /// @notice Whether a submission ID has been used.
    mapping(bytes32 => bool) public submissionRecorded;

    /// @notice Ballot hash saved for each submission ID.
    mapping(bytes32 => bytes32) public ballotCommitments;

    /// @notice Emitted when a ballot hash is saved.
    event BallotCommitted(
        bytes32 indexed submissionId,
        bytes32 commitment,
        uint256 timestamp
    );

    /// @notice Emitted when voting is opened or closed.
    event ElectionStatusChanged(bool active);

    /// @dev Only the election authority can call this function.
    modifier onlyAuthority() {
        require(msg.sender == electionAuthority, "Not authorized");
        _;
    }

    /// @dev The deployer becomes the authority. Voting starts closed.
    constructor() {
        electionAuthority = msg.sender;
        electionActive = false;
    }

    /// handles if the elction is active or not
    function setElectionActive(bool active) external onlyAuthority {
        electionActive = active;
        emit ElectionStatusChanged(active);
    }

    /// @notice Saves one ballot hash for a new submission ID.
    /// @dev Does not check the ballot or confirm who the voter is.
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
