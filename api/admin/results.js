import { json, methodNotAllowed } from "../_lib/http.js";
import { inferEligibleLevel, sortPostsByHierarchy } from "../_lib/post-order.js";
import { requireAdmin } from "../_lib/session.js";
import { supabaseRequest } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const rows = await supabaseRequest("election_results", {
      query: { select: "*", order: "post_order.asc,candidate_order.asc" },
    });
    const posts = [];
    rows.forEach((row) => {
      let post = posts.find((item) => item.id === row.post_id);
      if (!post) {
        post = {
          id: row.post_id,
          title: row.post_title,
          eligible_level: row.post_eligible_level || inferEligibleLevel({ title: row.post_title }),
          candidates: [],
        };
        posts.push(post);
      }
      post.candidates.push({
        id: row.candidate_id,
        name: row.candidate_name,
        votes: Number(row.vote_count || 0),
      });
    });
    return json(res, 200, {
      posts: sortPostsByHierarchy(posts).map((post) => ({
        ...post,
        eligible_level: inferEligibleLevel(post),
      })),
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not load results." });
  }
}
