import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { inferEligibleLevel, sortPostsByHierarchy } from "../_lib/post-order.js";
import { requireAdmin } from "../_lib/session.js";
import { insertRows, supabaseRequest } from "../_lib/supabase.js";

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const posts = await supabaseRequest("posts", {
        query: { select: "*", title: "not.like.__NACOS_UNN_ELECTION_CONTROL__:%", order: "display_order.asc" },
      });
      return json(res, 200, {
        posts: sortPostsByHierarchy(posts).map((post) => ({
          ...post,
          eligible_level: inferEligibleLevel(post),
        })),
      });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.title) return json(res, 400, { error: "Post title is required." });
      const payload = {
        title: body.title.trim(),
        eligible_level: body.eligible_level ? String(body.eligible_level).trim() : null,
        display_order: Number(body.display_order || 0),
        is_active: body.is_active !== false,
      };
      let [post] = await insertRows("posts", [payload]).catch(async (error) => {
        if (!String(error.message || "").includes("eligible_level")) throw error;
        const fallbackPayload = { ...payload };
        delete fallbackPayload.eligible_level;
        return insertRows("posts", [fallbackPayload]);
      });
      post = { ...post, eligible_level: inferEligibleLevel(post) || payload.eligible_level };
      return json(res, 201, { post });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body.id || !body.title) return json(res, 400, { error: "Post id and title are required." });
      const payload = {
        title: body.title.trim(),
        eligible_level: body.eligible_level ? String(body.eligible_level).trim() : null,
        display_order: Number(body.display_order || 0),
        is_active: body.is_active !== false,
      };
      const post = await supabaseRequest("posts", {
        method: "PATCH",
        query: { id: `eq.${body.id}` },
        body: payload,
      }).catch(async (error) => {
        if (!String(error.message || "").includes("eligible_level")) throw error;
        const fallbackPayload = { ...payload };
        delete fallbackPayload.eligible_level;
        return supabaseRequest("posts", {
          method: "PATCH",
          query: { id: `eq.${body.id}` },
          body: fallbackPayload,
        });
      });
      return json(res, 200, { post: { ...post[0], eligible_level: inferEligibleLevel(post[0]) || payload.eligible_level } });
    }

    if (req.method === "DELETE") {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: "Post id is required." });
      await supabaseRequest("posts", { method: "DELETE", query: { id: `eq.${id}` } });
      return json(res, 200, { message: "Post deleted." });
    }

    return methodNotAllowed(res);
  } catch (error) {
    return json(res, 500, { error: error.message || "Post request failed." });
  }
}
