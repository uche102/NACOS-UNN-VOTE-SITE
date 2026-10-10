import { supabaseRequest } from "./supabase.js";

export async function hasCompletedRecordedBallot(voter) {
  if (!voter?.otp_verified_at || !voter?.ballot_submitted_at) return false;

  const votes = await supabaseRequest("votes", {
    query: { reg_no: `eq.${voter.reg_no}`, select: "id", limit: "1" },
  });

  return votes.length > 0;
}
