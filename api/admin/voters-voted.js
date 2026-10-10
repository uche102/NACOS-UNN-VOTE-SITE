import { json, methodNotAllowed } from "../_lib/http.js";
import { requireAdmin } from "../_lib/session.js";
import { supabaseRequest } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const page = Math.max(1, Number(req.query?.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(req.query?.perPage || 10)));
    const offset = (page - 1) * perPage;

    const voters = await supabaseRequest("voters_with_vote_status", {
      query: {
        select: "*",
        has_voted: "eq.true",
        order: "name.asc",
        limit: String(perPage + 1),
        offset: String(offset),
      },
    });
    const hasNextPage = voters.length > perPage;
    return json(res, 200, {
      voters: hasNextPage ? voters.slice(0, perPage) : voters,
      page,
      perPage,
      hasNextPage,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not load voters." });
  }
}
