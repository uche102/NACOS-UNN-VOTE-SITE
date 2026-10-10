import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { inferEligibleLevel, positionRank } from "../_lib/post-order.js";
import { requireAdmin } from "../_lib/session.js";
import { supabaseRequest } from "../_lib/supabase.js";

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const { items = [] } = await readBody(req);
    const resetVotesOnly = items === "votes-only" || items?.resetVotesOnly === true;
    const votes = await supabaseRequest("votes", { query: { select: "id" } });
    const otpCodes = await supabaseRequest("otp_codes", { query: { select: "id" } });
    const voters = await supabaseRequest("voters", {
      query: {
        select: "reg_no",
        or: "(otp_claimed_at.not.is.null,otp_verified_at.not.is.null,ballot_submitted_at.not.is.null)",
      },
    });

    if (votes.length) {
      await supabaseRequest("votes", { method: "DELETE", query: { id: `in.(${votes.map((row) => row.id).join(",")})` } });
    }
    if (otpCodes.length) {
      await supabaseRequest("otp_codes", { method: "DELETE", query: { id: `in.(${otpCodes.map((row) => row.id).join(",")})` } });
    }
    if (voters.length) {
      await supabaseRequest("voters", {
        method: "PATCH",
        query: { reg_no: `in.(${voters.map((row) => row.reg_no).join(",")})` },
        body: {
          otp_claimed_at: null,
          otp_verified_at: null,
          ballot_submitted_at: null,
        },
      });
    }

    if (resetVotesOnly) {
      return json(res, 200, {
        message: "Votes and voter login state have been reset.",
        resetVotes: votes.length,
      });
    }

    const candidates = await supabaseRequest("candidates", { query: { select: "id" } });
    const posts = await supabaseRequest("posts", { query: { select: "id" } });

    if (candidates.length) {
      await supabaseRequest("candidates", { method: "DELETE", query: { id: `in.(${candidates.map((row) => row.id).join(",")})` } });
    }
    if (posts.length) {
      await supabaseRequest("posts", { method: "DELETE", query: { id: `in.(${posts.map((row) => row.id).join(",")})` } });
    }

    if (Array.isArray(items) && items.length) {
      const importedPosts = new Map();
      for (const item of items) {
        const title = String(item.post || item.title || "").trim();
        const name = String(item.name || "").trim();
        const tagline = String(item.tagline || "").trim();
        const image_url = String(item.image_url || item.image || "").trim();
        const eligible_level = String(item.eligible_level || item.level || "").trim() || null;
        const display_order = Number(item.display_order || item.order || 0);

        if (!title || !name) continue;

        const postKey = `${title}\u0000${eligible_level || ""}`;
        if (!importedPosts.has(postKey)) {
          const postPayload = {
            title,
            eligible_level: eligible_level || inferEligibleLevel({ title }),
            display_order: Number(item.post_order || item.group_order || positionRank({ title })),
            is_active: true,
          };
          const [post] = await supabaseRequest("posts", {
            method: "POST",
            body: postPayload,
          }).catch(async (error) => {
            if (!String(error.message || "").includes("eligible_level")) throw error;
            const fallbackPayload = { ...postPayload };
            delete fallbackPayload.eligible_level;
            return supabaseRequest("posts", { method: "POST", body: fallbackPayload });
          });
          importedPosts.set(postKey, post.id);
        }

        await supabaseRequest("candidates", {
          method: "POST",
          body: {
            post_id: importedPosts.get(postKey),
            name,
            tagline,
            image_url,
            display_order,
            is_active: true,
          },
        });
      }
    }

    return json(res, 200, {
      message: "Election setup has been reset.",
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Could not reset election setup." });
  }
}
