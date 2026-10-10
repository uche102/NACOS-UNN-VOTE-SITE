import { json, methodNotAllowed } from "./_lib/http.js";
import { requireVoter } from "./_lib/session.js";
import { getSingle } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const session = requireVoter(req, res);
    if (!session) return;

    const voter = await getSingle("voters", { reg_no: `eq.${session.reg_no}` });
    if (!voter) return json(res, 404, { error: "Voter not found." });

    const votes = await getSingle("votes", { reg_no: `eq.${session.reg_no}` });
    return json(res, 200, {
      voter: {
        reg_no: voter.reg_no,
        name: voter.name,
        level: voter.level,
      },
      hasVoted: Boolean(votes),
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not load profile." });
  }
}
