import "dotenv/config";
import {
  createVoterHash,
  recordBallot,
  getBlockchainInfo,
} from "../services/election.js";

async function main() {
  console.log("Blockchain connection:");
  console.log(await getBlockchainInfo());

  const voterHash = createVoterHash(
    "TEST-VOTER-001",
    process.env.BLOCKCHAIN_VOTER_SECRET
  );

  console.log("\nVoter hash:");
  console.log(voterHash);

  const result = await recordBallot({
    voterHash,
    postIds: [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ],
    candidateIds: [
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ],
  });

  console.log("\nBlockchain transaction:");
  console.log(result);
}

main().catch((error) => {
  console.error("\nBlockchain test failed:");
  console.error(error);
  process.exitCode = 1;
});
