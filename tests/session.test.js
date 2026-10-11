import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  createVoterSession,
  createAdminSession,
  requireVoter,
  requireAdmin,
} from "../api/_lib/session.js";

const originalEnv = {
  VOTER_SESSION_SECRET: process.env.VOTER_SESSION_SECRET,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  COOKIE_SAMESITE: process.env.COOKIE_SAMESITE,
};

process.env.VOTER_SESSION_SECRET = "test-voter-session-secret";
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

function signedToken(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

test("valid voter session is accepted", () => {
  const res = responseMock();
  const token = createVoterSession(res, {
    reg_no: "TEST-001",
    name: "Test Voter",
    level: "200L",
  });

  const result = requireVoter({
    headers: { authorization: `Bearer ${token}` },
  }, responseMock());

  assert.equal(result.reg_no, "TEST-001");
  assert.equal(result.level, "200L");
  assert.match(res.headers["Set-Cookie"], /HttpOnly/);
  assert.match(res.headers["Set-Cookie"], /Secure/);
});

test("tampered voter token is rejected", () => {
  const res = responseMock();
  const token = createVoterSession(res, {
    reg_no: "TEST-002",
    name: "Test Voter",
    level: "300L",
  });

  const altered = `${token.slice(0, -1)}x`;
  const response = responseMock();

  assert.equal(
    requireVoter({ headers: { authorization: `Bearer ${altered}` } }, response),
    null,
  );
  assert.equal(response.statusCode, 401);
});

test("expired voter session is rejected", () => {
  const token = signedToken({
    reg_no: "TEST-003",
    exp: Date.now() - 1000,
  }, process.env.VOTER_SESSION_SECRET);
  const response = responseMock();

  assert.equal(
    requireVoter({ headers: { authorization: `Bearer ${token}` } }, response),
    null,
  );
  assert.equal(response.statusCode, 401);
});

test("admin session is accepted", () => {
  const res = responseMock();
  const token = createAdminSession(res);
  const result = requireAdmin({
    headers: { authorization: `Bearer ${token}` },
  }, responseMock());

  assert.equal(result.role, "admin");
  assert.match(res.headers["Set-Cookie"], /HttpOnly/);
});

test("voter token cannot be used as an admin session", () => {
  const res = responseMock();
  const token = createVoterSession(res, {
    reg_no: "TEST-004",
    name: "Test Voter",
    level: "400L",
  });
  const response = responseMock();

  assert.equal(
    requireAdmin({ headers: { authorization: `Bearer ${token}` } }, response),
    null,
  );
  assert.equal(response.statusCode, 401);
});

test("a correctly signed token without expiry is rejected", () => {
  const token = signedToken({
    reg_no: "TEST-005",
    name: "No Expiry",
    level: "200L",
  }, process.env.VOTER_SESSION_SECRET);

  const response = responseMock();

  assert.equal(
    requireVoter({
      headers: { authorization: `Bearer ${token}` },
    }, response),
    null,
  );

  assert.equal(response.statusCode, 401);
});

test("invalid admin role is rejected", () => {
  const token = signedToken({
    role: "voter",
    exp: Date.now() + 60_000,
  }, process.env.ADMIN_SESSION_SECRET);
  const response = responseMock();

  assert.equal(
    requireAdmin({ headers: { authorization: `Bearer ${token}` } }, response),
    null,
  );
  assert.equal(response.statusCode, 401);
});

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
