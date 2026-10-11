import crypto from "node:crypto";
import { json, methodNotAllowed, readBody } from "./_lib/http.js";
import { getSingle, supabaseRequest } from "./_lib/supabase.js";
import { verifyPassword } from "./_lib/passwords.js";
import { createVoterSession } from "./_lib/session.js";
import { hasCompletedRecordedBallot } from "./_lib/ballot-status.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map();

function getAttemptKey(regNo, req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

  return crypto
    .createHash("sha256")
    .update(`${regNo}:${ip}`)
    .digest("hex");
}

function isRateLimited(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry) return false;

  if (entry.lockedUntil > now) return true;

  if (now - entry.windowStartedAt >= WINDOW_MS || entry.lockedUntil) {
    attempts.delete(key);
    return false;
  }

  return entry.failures >= MAX_FAILURES;
}

function recordFailure(key) {
  const now = Date.now();
  let entry = attempts.get(key);

  if (!entry || now - entry.windowStartedAt >= WINDOW_MS) {
    entry = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
  }

  entry.failures += 1;

  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
  }

  attempts.set(key, entry);
}

function clearFailures(key) {
  attempts.delete(key);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readBody(req);
    const regNo = String(body.reg_no || "").trim().toUpperCase();
    const password = String(body.password || "");

    if (!regNo || !password || regNo.length > 80 || password.length > 128) {
      return json(res, 400, {
        error: "Enter a valid registration number and password.",
      });
    }

    const attemptKey = getAttemptKey(regNo, req);

    if (isRateLimited(attemptKey)) {
      return json(res, 429, {
        error: "Too many login attempts. Try again in 15 minutes.",
      });
    }

    const voter = await getSingle("voters", {
      reg_no: `eq.${regNo}`,
    });

    if (!voter || !voter.password_hash) {
      recordFailure(attemptKey);
      return json(res, 401, {
        error: "Invalid registration number or password.",
      });
    }

    const valid = await verifyPassword(password, voter.password_hash);

    if (!valid) {
      recordFailure(attemptKey);
      return json(res, 401, {
        error: "Invalid registration number or password.",
      });
    }

    clearFailures(attemptKey);

    if (await hasCompletedRecordedBallot(voter)) {
      return json(res, 409, {
        error: "This voter has already voted.",
      });
    }

    const token = createVoterSession(res, voter);

    await supabaseRequest("voters", {
      method: "PATCH",
      query: { reg_no: `eq.${regNo}` },
      body: { otp_verified_at: new Date().toISOString() },
    }).catch(() => {});

    return json(res, 200, {
      message: "Login successful.",
      voter: {
        reg_no: voter.reg_no,
        name: voter.name,
        level: voter.level,
      },
      token,
    });
  } catch (error) {
    console.error("Voter password login failed:", error.message);
    return json(res, 500, { error: "Could not log in. Please try again." });
  }
}
