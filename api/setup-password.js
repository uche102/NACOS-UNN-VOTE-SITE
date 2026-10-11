import crypto from "node:crypto";
import { json, methodNotAllowed, readBody } from "./_lib/http.js";
import { getSingle, supabaseRequest } from "./_lib/supabase.js";
import { hashPassword, hashSetupCode } from "./_lib/passwords.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readBody(req);
    const regNo = String(body.reg_no || "").trim().toUpperCase();
    const code = String(body.setup_code || "").trim();
    const password = String(body.password || "");

    if (!regNo || !code || !password) {
      return json(res, 400, {
        error: "Registration number, setup code, and password are required.",
      });
    }

    if (regNo.length > 80 || code.length > 200) {
      return json(res, 400, { error: "Invalid registration number or setup code." });
    }

    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 128) {
      return json(res, 400, {
        error: "Password must be at least 12 characters and no more than 128 bytes.",
      });
    }

    const voter = await getSingle("voters", {
      reg_no: `eq.${regNo}`,
    });

    if (!voter || voter.password_hash) {
      return json(res, 400, {
        error: "Invalid registration number or setup code.",
      });
    }

    const expiresAt = new Date(voter.setup_code_expires_at || 0).getTime();

    if (
      !voter.setup_code_hash ||
      voter.setup_code_used_at ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      return json(res, 400, { error: "Setup code is invalid or expired." });
    }

    const suppliedHash = hashSetupCode(code);
    const expected = Buffer.from(voter.setup_code_hash, "hex");
    const supplied = Buffer.from(suppliedHash, "hex");

    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    ) {
      return json(res, 400, { error: "Setup code is invalid or expired." });
    }

    const passwordHash = await hashPassword(password);

    const result = await supabaseRequest(
      "rpc/complete_unn_voter_password_setup",
      {
        method: "POST",
        body: {
          p_reg_no: regNo,
          p_setup_code_hash: suppliedHash,
          p_password_hash: passwordHash,
        },
      },
    );

    if (result !== true) {
      return json(res, 409, {
        error: "Setup code has expired, changed, or already been used.",
      });
    }

    return json(res, 200, {
      message: "Password created successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Password setup failed:", error.message);
    return json(res, 500, {
      error: "Could not set up the voter password.",
    });
  }
}
