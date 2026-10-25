import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { requireAdmin } from "../_lib/session.js";
import { insertRows, supabaseRequest } from "../_lib/supabase.js";

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

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
      if (Array.isArray(body.candidates)) {
        if (!body.candidates.length) {
          return json(res, 400, { error: "Add at least one candidate to import." });
        }

        const [posts, existingCandidates] = await Promise.all([
          supabaseRequest("posts", { query: { select: "id,title" } }),
          supabaseRequest("candidates", {
            query: { select: "post_id,name" },
          }),
        ]);
        const postsByTitle = new Map();
        posts.forEach((post) => {
          const key = normalizeValue(post.title);
          postsByTitle.set(key, [...(postsByTitle.get(key) || []), post]);
        });
        const existingKeys = new Set(
          existingCandidates.map(
            (candidate) =>
              `${candidate.post_id}:${normalizeValue(candidate.name)}`,
          ),
        );
        const importedKeys = new Set();
        const errors = [];
        const rowsToInsert = [];

        body.candidates.forEach((row, index) => {
          const rowNumber =
            Number.isInteger(row?.row) && row.row >= 2 ? row.row : index + 2;
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            errors.push({ row: rowNumber, message: "Candidate row is invalid." });
            return;
          }

          const name = typeof row.name === "string" ? row.name.trim() : "";
          const position =
            typeof row.position === "string" ? row.position.trim() : "";
          const tagline = row.tagline ?? "";
          const imageUrl = row.image_url ?? "";
          let rowIsValid = true;

          if (!name) {
            errors.push({ row: rowNumber, message: "Candidate full name is required." });
            rowIsValid = false;
          } else if (name.toUpperCase().startsWith("DEMO ONLY -")) {
            errors.push({
              row: rowNumber,
              message: "Remove the demonstration example row before importing.",
            });
            rowIsValid = false;
          }

          if (!position) {
            errors.push({ row: rowNumber, message: "Position is required." });
            rowIsValid = false;
          }

          if (typeof tagline !== "string" || typeof imageUrl !== "string") {
            errors.push({
              row: rowNumber,
              message: "Tagline and Image URL must contain text.",
            });
            rowIsValid = false;
          }

          const matchingPosts = postsByTitle.get(normalizeValue(position)) || [];
          if (position && matchingPosts.length === 0) {
            errors.push({
              row: rowNumber,
              message: `Position "${position}" does not exist.`,
            });
            rowIsValid = false;
          } else if (matchingPosts.length > 1) {
            errors.push({
              row: rowNumber,
              message: `Position "${position}" is ambiguous. Use a unique position name.`,
            });
            rowIsValid = false;
          }

          const post = matchingPosts[0];
          const candidateKey = post
            ? `${post.id}:${normalizeValue(name)}`
            : "";
          if (name && post && existingKeys.has(candidateKey)) {
            errors.push({
              row: rowNumber,
              message: `${name} already exists for ${post.title}.`,
            });
            rowIsValid = false;
          } else if (name && post && importedKeys.has(candidateKey)) {
            errors.push({
              row: rowNumber,
              message: `${name} appears more than once for ${post.title} in this workbook.`,
            });
            rowIsValid = false;
          }

          if (candidateKey) importedKeys.add(candidateKey);
          if (rowIsValid) {
            rowsToInsert.push({
              post_id: post.id,
              name,
              tagline: tagline.trim(),
              image_url: imageUrl.trim(),
              display_order: 0,
              is_active: true,
            });
          }
        });

        if (errors.length) {
          return json(res, 400, {
            error: "No candidates were imported. Correct the listed rows and try again.",
            errors,
          });
        }

        const candidates = await insertRows("candidates", rowsToInsert);
        return json(res, 201, { candidates, imported: candidates.length });
      }

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
