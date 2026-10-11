import crypto from "node:crypto";
import { getBearerToken, getCookie, json, setCookie } from "./http.js";

const VOTER_COOKIE = "nacos_unn_voter";
const ADMIN_COOKIE = "nacos_unn_admin";

function signPayload(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token || !secret || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (!Number.isFinite(payload.exp) || Date.now() >= payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createVoterSession(res, voter) {
  const secret = process.env.VOTER_SESSION_SECRET;
  const token = signPayload(
    {
      reg_no: voter.reg_no,
      name: voter.name,
      level: voter.level,
      exp: Date.now() + 1000 * 60 * 60 * 6,
    },
    secret,
  );
  setCookie(res, VOTER_COOKIE, token, 60 * 60 * 6);
  return token;
}

export function createAdminSession(res) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = signPayload(
    { role: "admin", exp: Date.now() + 1000 * 60 * 60 * 8 },
    secret,
  );
  setCookie(res, ADMIN_COOKIE, token, 60 * 60 * 8);
  return token;
}

export function requireVoter(req, res) {
  const voter = verifyToken(
    getBearerToken(req) || getCookie(req, VOTER_COOKIE),
    process.env.VOTER_SESSION_SECRET,
  );
  if (!voter) {
    json(res, 401, { error: "Voter session expired. Please login again." });
    return null;
  }
  return voter;
}

export function requireAdmin(req, res) {
  const admin = verifyToken(
    getBearerToken(req) || getCookie(req, ADMIN_COOKIE),
    process.env.ADMIN_SESSION_SECRET,
  );
  if (!admin || admin.role !== "admin") {
    json(res, 401, { error: "Admin login required." });
    return null;
  }
  return admin;
}
