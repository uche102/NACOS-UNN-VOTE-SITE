import { supabaseRequest } from "./supabase.js";
import { createVoterIndex } from "./ballot-crypto.js";

export async function hasCompletedRecordedBallot(voter) {
  if (!voter?.reg_no) return false;
  const voterKey = createVoterIndex(voter.reg_no);

  const submissions = await supabaseRequest("unn_ballot_submissions", {
    query: {
      voter_key: `eq.${voterKey}`,
      status: "eq.confirmed",
      select: "submission_id",
      limit: "1",
    },
  });

  return submissions.length > 0;
}
