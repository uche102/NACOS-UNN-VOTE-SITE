import test from "node:test";
import assert from "node:assert/strict";

process.env.VOTER_SESSION_SECRET = "test-only-secret";

const {
  default: handler,
  hasMultipleCandidatesForAnyPost,
} = await import("../api/vote.js");

test("ballots allow at most one candidate for every post", () => {
  assert.equal(
    hasMultipleCandidatesForAnyPost({
      hor: ["candidate-1", "candidate-2"],
      president: "candidate-3",
    }),
    true,
  );
  assert.equal(
    hasMultipleCandidatesForAnyPost({
      hor: ["candidate-1"],
      president: "candidate-3",
    }),
    false,
  );
});

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      this.body = value ? JSON.parse(value) : null;
    },
  };
}

test("non-POST requests are rejected without processing a vote", async () => {
  const res = mockResponse();

  await handler({ method: "GET", headers: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error, "Method not allowed");
});

test("requests without a voter session are rejected before election access", async () => {
  const res = mockResponse();

  await handler(
    {
      method: "POST",
      headers: {},
      body: { selections: { post1: "candidate1" } },
    },
    res,
  );

  assert.equal(res.statusCode, 401);
  assert.equal(
    res.body.error,
    "Voter session expired. Please login again.",
  );
});
