import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { requireAdmin } from "../_lib/session.js";
import { insertRows, supabaseRequest } from "../_lib/supabase.js";

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const candidates = await supabaseRequest("candidates", {
        query: { select: "*", order: "display_order.asc" },
      });
      return json(res, 200, { candidates });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.post_id || !body.name) {
        return json(res, 400, { error: "Candidate name and post are required." });
      }
      const [candidate] = await insertRows("candidates", [
        {
          post_id: body.post_id,
          name: body.name.trim(),
          tagline: body.tagline || "",
          image_url: body.image_url || "",
          display_order: Number(body.display_order || 0),
          is_active: body.is_active !== false,
        },
      ]);
      return json(res, 201, { candidate });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body.id || !body.post_id || !body.name) {
        return json(res, 400, { error: "Candidate id, name, and post are required." });
      }
      const candidate = await supabaseRequest("candidates", {
        method: "PATCH",
        query: { id: `eq.${body.id}` },
        body: {
          post_id: body.post_id,
          name: body.name.trim(),
          tagline: body.tagline || "",
          image_url: body.image_url || "",
          display_order: Number(body.display_order || 0),
          is_active: body.is_active !== false,
        },
      });
      return json(res, 200, { candidate: candidate[0] });
    }

    if (req.method === "DELETE") {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: "Candidate id is required." });
      await supabaseRequest("candidates", { method: "DELETE", query: { id: `eq.${id}` } });
      return json(res, 200, { message: "Candidate deleted." });
    }

    return methodNotAllowed(res);
  } catch (error) {
    return json(res, 500, { error: error.message || "Candidate request failed." });
  }
}
