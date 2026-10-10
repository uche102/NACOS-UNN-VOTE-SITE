import { json, methodNotAllowed } from "./_lib/http.js";
import { getElectionStatus } from "./_lib/election-status.js";
import { inferEligibleLevel, sortPostsByHierarchy } from "./_lib/post-order.js";
import { supabaseRequest } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const status = await getElectionStatus();
    let posts;
    try {
      posts = await supabaseRequest("posts", {
        query: {
          select: "id,title,eligible_level,display_order,is_active",
          is_active: "eq.true",
          title: "not.like.__NACOS_UNN_ELECTION_CONTROL__:%",
          order: "display_order.asc",
        },
      });
    } catch (error) {
      if (!String(error.message || "").includes("eligible_level")) throw error;
      posts = await supabaseRequest("posts", {
        query: {
          select: "id,title,display_order,is_active",
          is_active: "eq.true",
          title: "not.like.__NACOS_UNN_ELECTION_CONTROL__:%",
          order: "display_order.asc",
        },
      });
    }
    const candidates = await supabaseRequest("candidates", {
      query: { select: "id,post_id,name,tagline,image_url,display_order,is_active", is_active: "eq.true", order: "display_order.asc" },
    });

    return json(res, 200, {
      votingOpen: status.votingOpen,
      statusUpdatedAt: status.updatedAt,
      posts: sortPostsByHierarchy(posts).map((post) => ({
        ...post,
        eligible_level: inferEligibleLevel(post),
        candidates: candidates.filter((candidate) => candidate.post_id === post.id),
      })),
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not load election." });
  }
}
