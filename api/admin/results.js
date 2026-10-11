import { json, methodNotAllowed } from "../_lib/http.js";
import { inferEligibleLevel, sortPostsByHierarchy } from "../_lib/post-order.js";
import { requireAdmin } from "../_lib/session.js";
import { supabaseRequest } from "../_lib/supabase.js";
import { tallyConfirmedBallots } from "../_lib/results-tally.js";

const CLOSED_CONTROL = "__NACOS_UNN_ELECTION_CONTROL__:CLOSED";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const control = await supabaseRequest("posts", {
      query: { select: "id,title", title: `eq.${CLOSED_CONTROL}`, limit: "1" },
    });

    if (!control.length) {
      return json(res, 409, {
        error: "Results are available only after the election is closed.",
      });
    }

    const [postsRows, candidatesRows, submissions] = await Promise.all([
      supabaseRequest("posts", {
        query: {
          select: "id,title,eligible_level,display_order,is_active",
          order: "display_order.asc",
        },
      }),
      supabaseRequest("candidates", {
        query: {
          select: "id,post_id,name,display_order,is_active",
          order: "display_order.asc",
        },
      }),
      supabaseRequest("ballot_submissions", {
        query: {
          select: "submission_id,ballot_ciphertext,ballot_commitment",
          status: "eq.confirmed",
        },
      }),
    ]);

    // Preserve election records referenced by confirmed ballots, even if
    // an administrator later deactivates a post or candidate.
    const electionPosts = postsRows.filter(
      (post) => !post.title?.startsWith("__NACOS_UNN_ELECTION_CONTROL__:")
    );

    const { posts, countedBallots } = tallyConfirmedBallots(
      electionPosts,
      candidatesRows,
      submissions,
    );

    return json(res, 200, {
      posts: sortPostsByHierarchy(posts).map((post) => ({
        ...post,
        eligible_level: inferEligibleLevel(post),
      })),
      countedBallots,
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin results error:", error);
    return json(res, 500, {
      error: "Could not verify and load election results.",
    });
  }
}
