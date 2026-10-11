import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { requireAdmin } from "../_lib/session.js";
import { insertRows, supabaseRequest } from "../_lib/supabase.js";

const VALID_LEVELS = new Set(["100L", "200L", "300L", "400L", "500L"]);

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      const voters = await supabaseRequest("voters", {
        query: {
          select: "reg_no,name,email,level,created_at",
          order: "created_at.desc",
        },
      });
      return json(res, 200, { voters });
    }

    if (req.method !== "POST") return methodNotAllowed(res);

    const body = await readBody(req);
    const regNo = String(body.reg_no || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const level = String(body.level || "").trim().toUpperCase();

    if (!regNo || !name || !email || !level) {
      return json(res, 400, {
        error: "Voter ID, full name, email, and level are required.",
      });
    }

    if (regNo.length > 80 || name.length > 120) {
      return json(res, 400, { error: "Voter ID or name is too long." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json(res, 400, { error: "Enter a valid email address." });
    }

    if (!VALID_LEVELS.has(level)) {
      return json(res, 400, { error: "Select a valid academic level." });
    }

    const existing = await supabaseRequest("voters", {
      query: { select: "reg_no", reg_no: `eq.${regNo}`, limit: "1" },
    });

    if (existing.length) {
      return json(res, 409, { error: "That voter ID is already registered." });
    }

    const [voter] = await insertRows("voters", [
      { reg_no: regNo, name, email, level },
    ]);

    return json(res, 201, {
      voter: {
        reg_no: voter.reg_no,
        name: voter.name,
        email: voter.email,
        level: voter.level,
        created_at: voter.created_at,
      },
    });
  } catch (error) {
    if (String(error.message || "").includes("duplicate key")) {
      return json(res, 409, { error: "That voter ID is already registered." });
    }

    console.error("Admin voter request failed:", error.message);
    return json(res, 500, { error: "Could not process voter registration." });
  }
}
