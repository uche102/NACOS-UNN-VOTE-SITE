import { expect } from "chai";
import { network } from "hardhat";
import { ethers } from "ethers";

describe("NACOSUNNElection", function () {
  async function deployElection() {
    const { ethers: hardhatEthers } = await network.connect();
    const [authority, otherAccount] = await hardhatEthers.getSigners();

    const Factory =
      await hardhatEthers.getContractFactory("NACOSUNNElection");
    const election = await Factory.deploy();
    await election.waitForDeployment();

    return { election, authority, otherAccount };
  }

  const hash = (value: string) => ethers.id(value);

  it("sets the deployer as authority and starts inactive", async function () {
    const { election, authority } = await deployElection();

    expect(await election.electionAuthority()).to.equal(authority.address);
    expect(await election.electionActive()).to.equal(false);
  });

  it("allows only the authority to change election status", async function () {
    const { election, otherAccount } = await deployElection();

    await expect(election.setElectionActive(true))
      .to.emit(election, "ElectionStatusChanged")
      .withArgs(true);

    expect(await election.electionActive()).to.equal(true);

    await expect(
      election.connect(otherAccount).setElectionActive(false)
    ).to.be.revertedWith("Not authorized");
  });

  it("records a commitment without exposing candidate selections", async function () {
    const { election } = await deployElection();
    const submissionId = hash("submission-001");
    const commitment = hash("private-ballot-commitment");

    await election.setElectionActive(true);

await expect(election.recordBallot(submissionId, commitment))
  .to.emit(election, "BallotCommitted")
  .withArgs(submissionId, commitment, (timestamp: bigint) => timestamp > 0n);

    expect(await election.submissionRecorded(submissionId)).to.equal(true);
    expect(await election.ballotCommitments(submissionId)).to.equal(commitment);
  });

  it("rejects submissions while inactive", async function () {
    const { election } = await deployElection();

    await expect(
      election.recordBallot(hash("submission-002"), hash("commitment-002"))
    ).to.be.revertedWith("Election is not active");
  });

  it("rejects duplicate submission IDs", async function () {
    const { election } = await deployElection();
    const submissionId = hash("submission-003");

    await election.setElectionActive(true);
    await election.recordBallot(submissionId, hash("commitment-003"));

    await expect(
      election.recordBallot(submissionId, hash("commitment-004"))
    ).to.be.revertedWith("Submission already recorded");
  });

  it("rejects zero submission IDs and zero commitments", async function () {
    const { election } = await deployElection();
    await election.setElectionActive(true);

    await expect(
      election.recordBallot(ethers.ZeroHash, hash("commitment-005"))
    ).to.be.revertedWith("Invalid submission ID");

    await expect(
      election.recordBallot(hash("submission-005"), ethers.ZeroHash)
    ).to.be.revertedWith("Invalid commitment");
  });

  it("rejects ballot recording by non-authorities", async function () {
    const { election, otherAccount } = await deployElection();
    await election.setElectionActive(true);

    await expect(
      election.connect(otherAccount).recordBallot(
        hash("submission-006"),
        hash("commitment-006")
      )
    ).to.be.revertedWith("Not authorized");
  });
});
