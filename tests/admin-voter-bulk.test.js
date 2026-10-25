import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.ADMIN_SESSION_SECRET = "test-only-admin-secret";
process.env.SETUP_CODE_PEPPER = "test-only-setup-code-pepper";
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";

const { default: handler } = await import("../api/admin/voters.js");
const { default: setupCodeHandler } = await import("../api/admin/setup-code.js");
const { default: setupPasswordHandler } = await import("../api/setup-password.js");

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

async function withSupabase(existingVoters, callback) {
  const originalFetch = globalThis.fetch;
  const insertedBatches = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === "POST") {
      const batch = JSON.parse(options.body);
      insertedBatches.push(batch);
      return new Response(
        JSON.stringify(
          batch.map((voter) => ({ ...voter, created_at: "2026-01-01T00:00:00Z" })),
        ),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.pathname.endsWith("/unn_voters")) {
      return new Response(JSON.stringify(existingVoters), {
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

function request(body) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken()}` },
    body,
  };
}

test("bulk voter import inserts valid records in one batch without passwords", async () => {
  await withSupabase([], async (insertedBatches) => {
    const res = mockResponse();
    await handler(
      request({
        voters: [
          { row: 2, reg_no: "unn001", name: "Ada Example", email: "ada@example.edu", level: "100L" },
          { row: 3, reg_no: "UNN002", name: "Sam Sample", email: "sam@example.edu", level: "200L" },
        ],
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.imported, 2);
    assert.equal(insertedBatches.length, 1);
    assert.deepEqual(insertedBatches[0], [
      { reg_no: "UNN001", name: "Ada Example", email: "ada@example.edu", level: "100L" },
      { reg_no: "UNN002", name: "Sam Sample", email: "sam@example.edu", level: "200L" },
    ]);
  });
});

test("duplicate voter IDs and emails reject the entire import", async () => {
  await withSupabase(
    [{ reg_no: "EXISTING1", email: "used@example.edu" }],
    async (insertedBatches) => {
      const res = mockResponse();
      await handler(
        request({
          voters: [
            { row: 2, reg_no: "existing1", name: "Existing", email: "new@example.edu", level: "100L" },
            { row: 3, reg_no: "NEW002", name: "New", email: "used@example.edu", level: "200L" },
            { row: 4, reg_no: "NEW003", name: "One", email: "same@example.edu", level: "300L" },
            { row: 5, reg_no: "NEW004", name: "Two", email: "SAME@example.edu", level: "400L" },
            { row: 6, reg_no: "new003", name: "Duplicate ID", email: "other@example.edu", level: "500L" },
          ],
        }),
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.equal(insertedBatches.length, 0);
      assert.deepEqual(
        res.body.errors.map(({ row }) => row),
        [2, 3, 5, 6],
      );
    },
  );
});

test("invalid voter fields reject every row before insertion", async () => {
  await withSupabase([], async (insertedBatches) => {
    const res = mockResponse();
    await handler(
      request({
        voters: [
          { row: 2, reg_no: "BAD001", name: "Bad", email: "not-an-email", level: "700L" },
          { row: 3, reg_no: "", name: "", email: "", level: "" },
          { row: 4, reg_no: "BAD004", name: "Bad Level", email: "level@example.edu", level: "700L" },
          { row: 5, reg_no: 12345, name: "Numeric ID", email: "numeric@example.edu", level: "100L" },
        ],
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(insertedBatches.length, 0);
    assert.ok(res.body.errors.some((error) => error.row === 2 && /valid email/.test(error.message)));
    assert.ok(res.body.errors.some((error) => error.row === 3 && /required/.test(error.message)));
    assert.ok(res.body.errors.some((error) => error.row === 4 && /academic level/.test(error.message)));
    assert.ok(res.body.errors.some((error) => error.row === 5 && /must contain text/.test(error.message)));
  });
});

test("unauthorized users cannot bulk-register voters", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Database should not be reached.");
  };
  try {
    const res = mockResponse();
    await handler({ method: "POST", headers: {}, body: { voters: [] } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual voter registration keeps its existing request shape", async () => {
  await withSupabase([], async (insertedBatches) => {
    const res = mockResponse();
    await handler(
      request({
        reg_no: "unn123",
        name: "Manual Voter",
        email: "manual@example.edu",
        level: "100L",
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.voter.reg_no, "UNN123");
    assert.equal(insertedBatches.length, 1);
    assert.equal(insertedBatches[0][0].reg_no, "UNN123");
  });
});

test("an imported voter can activate through the existing setup-code flow", async () => {
  const originalFetch = globalThis.fetch;
  let storedVoter = null;
  let rpcBody = null;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/unn_voters") && options.method === "POST") {
      const [voter] = JSON.parse(options.body);
      storedVoter = { ...voter, password_hash: null };
      return new Response(JSON.stringify([storedVoter]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/unn_voters") && options.method === "PATCH") {
      storedVoter = { ...storedVoter, ...JSON.parse(options.body) };
      return new Response(JSON.stringify([storedVoter]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/unn_voters")) {
      return new Response(JSON.stringify(storedVoter ? [storedVoter] : []), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.endsWith("/rpc/complete_unn_voter_password_setup")) {
      rpcBody = JSON.parse(options.body);
      return new Response("true", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected Supabase request: ${url.pathname}`);
  };

  try {
    const importResponse = mockResponse();
    await handler(
      request({
        voters: [
          {
            row: 2,
            reg_no: "UNN901",
            name: "Imported Voter",
            email: "imported@example.edu",
            level: "300L",
          },
        ],
      }),
      importResponse,
    );
    assert.equal(importResponse.statusCode, 201);
    assert.equal(storedVoter.password_hash, null);

    const codeResponse = mockResponse();
    await setupCodeHandler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${adminToken()}` },
        body: { reg_no: "UNN901" },
      },
      codeResponse,
    );
    assert.equal(codeResponse.statusCode, 200);
    assert.ok(codeResponse.body.setup_code);

    const setupResponse = mockResponse();
    await setupPasswordHandler(
      {
        method: "POST",
        headers: {},
        body: {
          reg_no: "UNN901",
          setup_code: codeResponse.body.setup_code,
          password: "a-long-secure-password",
        },
      },
      setupResponse,
    );
    assert.equal(setupResponse.statusCode, 200);
    assert.equal(setupResponse.body.message, "Password created successfully. You can now log in.");
    assert.ok(rpcBody.p_password_hash);
    assert.equal(JSON.stringify(rpcBody).includes("a-long-secure-password"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
