import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.VOTER_SESSION_SECRET = "test-only-voter-secret";
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
process.env.BALLOT_ENCRYPTION_KEY = "22".repeat(32);

const { default: handler } = await import("../api/me.js");

function createToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.VOTER_SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("profile reports a confirmed ballot from ballot submissions", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requestedUrls.push(url);
    const body = url.pathname.endsWith("/unn_voters")
      ? [{ reg_no: "NACOS-TEST-001", name: "Test Voter", level: "400L" }]
      : [{ submission_id: "submission-1" }];

    return {
      ok: true,
      async text() {
        return JSON.stringify(body);
      },
    };
  };

  try {
    const token = createToken({
      reg_no: "NACOS-TEST-001",
      exp: Date.now() + 60_000,
    });
    const res = mockResponse();

    await handler({ method: "GET", headers: { authorization: `Bearer ${token}` } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.hasVoted, true);
    assert.equal(requestedUrls.length, 2);
    assert.equal(requestedUrls[1].pathname.endsWith("/unn_ballot_submissions"), true);
    assert.equal(requestedUrls[1].searchParams.get("status"), "eq.confirmed");
    assert.equal(requestedUrls[1].searchParams.has("voter_reg_no"), false);
    assert.ok(requestedUrls[1].searchParams.get("voter_key"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
