import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { requireAdmin } from "../_lib/session.js";
import { createSetupCode, hashSetupCode } from "../_lib/passwords.js";
import { getSingle, supabaseRequest } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  if (!requireAdmin(req, res)) return;

  try {
    const body = await readBody(req);
    const regNo = String(body.reg_no || "").trim().toUpperCase();

    if (!regNo || regNo.length > 80) {
      return json(res, 400, { error: "A valid voter ID is required." });
    }

    const voter = await getSingle("voters", {
      reg_no: `eq.${regNo}`,
    });

    if (!voter) {
      return json(res, 404, { error: "Registered voter not found." });
    }

    if (voter.password_hash) {
      return json(res, 409, {
        error: "This voter already has a password.",
      });
    }

    const code = createSetupCode();
    const codeHash = hashSetupCode(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const updated = await supabaseRequest("voters", {
      method: "PATCH",
      query: { reg_no: `eq.${regNo}` },
      body: {
        setup_code_hash: codeHash,
        setup_code_expires_at: expiresAt,
        setup_code_used_at: null,
      },
    });

    if (!Array.isArray(updated) || updated.length !== 1) {
      throw new Error("Could not save the setup code.");
    }

    return json(res, 200, {
      message: "One-time setup code generated.",
      reg_no: regNo,
      setup_code: code,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("Setup-code generation failed:", error.message);
    return json(res, 500, {
      error: "Could not generate the setup code.",
    });
  }
}
