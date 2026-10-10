
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  console.log("Deploying NACOSUNNElection...");

  const NACOSUNNElection =
    await ethers.getContractFactory("NACOSUNNElection");

  const election = await NACOSUNNElection.deploy();

  await election.waitForDeployment();

  console.log("NACOS UNN election contract deployed to:");
  console.log(await election.getAddress());

  console.log("Election authority:");
  console.log(await election.electionAuthority());

  console.log("Election active:");
  console.log(await election.electionActive());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
