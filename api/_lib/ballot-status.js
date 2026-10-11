import { supabaseRequest } from "./supabase.js";

export async function hasCompletedRecordedBallot(voter) {
  if (!voter?.reg_no) return false;

  const submissions = await supabaseRequest("unn_ballot_submissions", {
    query: {
      voter_reg_no: `eq.${voter.reg_no}`,
      status: "eq.confirmed",
      select: "submission_id",
      limit: "1",
    },
  });

  return submissions.length > 0;
}
