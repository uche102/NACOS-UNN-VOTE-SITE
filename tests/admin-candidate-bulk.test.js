import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.ADMIN_SESSION_SECRET = "test-only-admin-secret";
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";

const { default: handler } = await import("../api/admin/candidates.js");

const posts = [{ id: "post-1", title: "President" }];

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

function adminToken() {
  const encoded = Buffer.from(
    JSON.stringify({ role: "admin", exp: Date.now() + 60_000 }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function withSupabase(existingCandidates, callback) {
  const originalFetch = globalThis.fetch;
  const insertedBatches = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === "POST") {
      const batch = JSON.parse(options.body);
      insertedBatches.push(batch);
      return new Response(
        JSON.stringify(
          batch.map((candidate, index) => ({
            id: `candidate-${index + 1}`,
            ...candidate,
          })),
        ),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.pathname.endsWith("/unn_posts")) {
      return new Response(JSON.stringify(posts), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/unn_candidates")) {
      return new Response(JSON.stringify(existingCandidates), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected Supabase request: ${url.pathname}`);
  };

  try {
    await callback(insertedBatches);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function request(candidates) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken()}` },
    body: { candidates },
  };
}

test("bulk candidate import inserts all validated rows in one batch", async () => {
  await withSupabase([], async (insertedBatches) => {
    const res = mockResponse();
    await handler(
      request([
        { row: 2, name: "Ada Example", position: "President", tagline: "Ready" },
        { row: 3, name: "Sam Sample", position: "President", image_url: "/sam.png" },
      ]),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.imported, 2);
    assert.equal(insertedBatches.length, 1);
    assert.deepEqual(
      insertedBatches[0].map(({ post_id, name, is_active }) => ({
        post_id,
        name,
        is_active,
      })),
      [
        { post_id: "post-1", name: "Ada Example", is_active: true },
        { post_id: "post-1", name: "Sam Sample", is_active: true },
      ],
    );
  });
});

test("invalid positions and workbook duplicates reject the entire batch", async () => {
  await withSupabase([], async (insertedBatches) => {
    const res = mockResponse();
    await handler(
      request([
        { row: 2, name: "Ada Example", position: "President" },
        { row: 3, name: "Unknown Candidate", position: "Treasurer" },
        { row: 4, name: " ada example ", position: "President" },
      ]),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(insertedBatches.length, 0);
    assert.deepEqual(
      res.body.errors.map(({ row }) => row),
      [3, 4],
    );
    assert.match(res.body.errors[0].message, /does not exist/);
    assert.match(res.body.errors[1].message, /more than once/);
  });
});

test("candidates already stored for a position cannot be imported again", async () => {
  await withSupabase(
    [{ post_id: "post-1", name: "Ada Example" }],
    async (insertedBatches) => {
      const res = mockResponse();
      await handler(
        request([{ row: 2, name: "ada example", position: "President" }]),
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.equal(insertedBatches.length, 0);
      assert.match(res.body.errors[0].message, /already exists/);
    },
  );
});

test("unauthorized users cannot import candidates", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Database should not be reached.");
  };

  try {
    const res = mockResponse();
    await handler(
      { method: "POST", headers: {}, body: { candidates: [] } },
      res,
    );

    assert.equal(res.statusCode, 401);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual candidate creation still uses the existing request shape", async () => {
  await withSupabase([], async (insertedBatches) => {
    const res = mockResponse();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${adminToken()}` },
        body: {
          post_id: "post-1",
          name: "Manual Candidate",
          tagline: "Existing form",
        },
      },
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.candidate.name, "Manual Candidate");
    assert.equal(insertedBatches.length, 1);
    assert.equal(insertedBatches[0][0].post_id, "post-1");
  });
});
