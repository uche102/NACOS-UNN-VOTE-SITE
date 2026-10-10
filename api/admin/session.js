import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { getElectionStatus, setElectionStatus } from "../_lib/election-status.js";
import { requireAdmin } from "../_lib/session.js";

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const status = await getElectionStatus();
      return json(res, 200, { admin: true, ...status });
    }

    if (req.method === "PATCH") {
      const { votingOpen } = await readBody(req);
      if (typeof votingOpen !== "boolean") {
        return json(res, 400, { error: "votingOpen must be true or false." });
      }
      return json(res, 200, await setElectionStatus(votingOpen));
    }

    return methodNotAllowed(res);
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not load admin session." });
  }
}
