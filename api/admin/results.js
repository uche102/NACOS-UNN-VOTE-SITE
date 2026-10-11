import { json, methodNotAllowed } from "../_lib/http.js";
import { inferEligibleLevel, sortPostsByHierarchy } from "../_lib/post-order.js";
import { requireAdmin } from "../_lib/session.js";
import { supabaseRequest } from "../_lib/supabase.js";
import { decryptBallotEnvelope } from "../_lib/ballot-crypto.js";

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

    const posts = electionPosts.map((post) => ({
      id: post.id,
      title: post.title,
      eligible_level:
        post.eligible_level || inferEligibleLevel({ title: post.title }),
      candidates: candidatesRows
        .filter((candidate) => candidate.post_id === post.id)
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          votes: 0,
        })),
    }));

    const candidateById = new Map();
    for (const post of posts) {
      for (const candidate of post.candidates) {
        candidateById.set(candidate.id, { candidate, postId: post.id });
      }
    }

    let countedBallots = 0;

    for (const submission of submissions) {
      const recovered = decryptBallotEnvelope(
        submission.submission_id,
        submission.ballot_ciphertext,
        submission.ballot_commitment
      );

      if (!recovered.commitmentValid || !Array.isArray(recovered.ballot)) {
        throw new Error("A confirmed ballot failed verification.");
      }

      const selectionsInBallot = new Set();

      for (const entry of recovered.ballot) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new Error("A ballot contains invalid selection data.");
        }

        const [postId, candidateIds] = entry;
        if (!Array.isArray(candidateIds)) {
          throw new Error("A ballot contains invalid candidate selections.");
        }

        for (const candidateId of candidateIds) {
          const found = candidateById.get(candidateId);
          if (!found || found.postId !== postId) {
            throw new Error("A ballot references an invalid candidate.");
          }

          if (selectionsInBallot.has(candidateId)) {
            throw new Error("A ballot contains a duplicate candidate.");
          }
          selectionsInBallot.add(candidateId);
          found.candidate.votes += 1;
        }
      }

      countedBallots += 1;
    }

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
