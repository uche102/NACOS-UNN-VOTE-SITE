import { json, methodNotAllowed } from "./_lib/http.js";
import { requireVoter } from "./_lib/session.js";
import { getSingle } from "./_lib/supabase.js";
import { hasCompletedRecordedBallot } from "./_lib/ballot-status.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const session = requireVoter(req, res);
    if (!session) return;
//handler for GET /api/me
    const voter = await getSingle("voters", { reg_no: `eq.${session.reg_no}` });
    if (!voter) return json(res, 404, { error: "Voter not found." });
//handles the case where the voter is not found in the database
    return json(res, 200, {
      voter: {
        reg_no: voter.reg_no,
        name: voter.name,
        level: voter.level,
      },
      hasVoted: await hasCompletedRecordedBallot(voter),
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not load profile." });
  }
}
