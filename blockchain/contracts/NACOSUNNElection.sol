// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract NACOSUNNElection {
    address public electionAuthority;
    bool public electionActive;

    // Prevents a voter from submitting more than one ballot.
    mapping(bytes32 => bool) public hasVoted;

    // postId => candidateId => vote count
    mapping(bytes32 => mapping(bytes32 => uint256)) public voteCount;

    event BallotRecorded(
        bytes32 indexed voterHash,
        bytes32[] postIds,
        bytes32[] candidateIds,
        uint256 timestamp
    );

    event ElectionStatusChanged(bool active);

    modifier onlyAuthority() {
        require(
            msg.sender == electionAuthority,
            "Not authorized"
        );
        _;
    }

    constructor() {
        electionAuthority = msg.sender;
        electionActive = true;
    }

    function setElectionActive(bool active) external onlyAuthority {
        electionActive = active;

        emit ElectionStatusChanged(active);
    }

    function recordBallot(
        bytes32 voterHash,
        bytes32[] calldata postIds,
        bytes32[] calldata candidateIds
    ) external onlyAuthority {
        require(electionActive, "Election is not active");
        require(voterHash != bytes32(0), "Invalid voter hash");
        require(
            !hasVoted[voterHash],
            "Voter has already voted"
        );
        require(
            postIds.length > 0,
            "Ballot cannot be empty"
        );
        require(
            postIds.length == candidateIds.length,
            "Mismatched ballot data"
        );

        hasVoted[voterHash] = true;

        for (uint256 i = 0; i < postIds.length; i++) {
            require(
                postIds[i] != bytes32(0),
                "Invalid post ID"
            );
            require(
                candidateIds[i] != bytes32(0),
                "Invalid candidate ID"
            );

            voteCount[postIds[i]][candidateIds[i]] += 1;
        }

        emit BallotRecorded(
            voterHash,
            postIds,
            candidateIds,
            block.timestamp
        );
    }

    function getVoteCount(
        bytes32 postId,
        bytes32 candidateId
    ) external view returns (uint256) {
        return voteCount[postId][candidateId];
    }

    function hasVoterVoted(
        bytes32 voterHash
    ) external view returns (bool) {
        return hasVoted[voterHash];
    }
}
