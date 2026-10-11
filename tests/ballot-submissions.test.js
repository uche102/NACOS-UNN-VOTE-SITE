import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";

const {
  updateSubmission,
  finalizeSubmission,
  recordSubmissionTransaction,
} = await import("../api/_lib/ballot-submissions.js");

const submissionId = "11111111-1111-4111-8111-111111111111";
const commitment = `0x${"a".repeat(64)}`;
const transactionHash = `0x${"b".repeat(64)}`;

function mockFetch(responseBody, { ok = true, status = 200 } = {}) {
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });

    return {
      ok,
      status,
      async text() {
        return responseBody === null ? "" : JSON.stringify(responseBody);
      },
    };
  };

  return calls;
}

test.beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;

  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});

test("updateSubmission rejects unsupported fields without making a request", async () => {
  const calls = mockFetch([]);

  await assert.rejects(
    updateSubmission(submissionId, {
      voter_reg_no: "NACOS-TEST-001",
    }),
    /Unsupported submission field: voter_reg_no/,
  );

  assert.equal(calls.length, 0);
});

test("updateSubmission maps a returned database row to camelCase", async () => {
  const calls = mockFetch([{
    id: "row-1",
    submission_id: submissionId,
    voter_reg_no: "NACOS-TEST-001",
    status: "pending",
    transaction_hash: transactionHash,
    block_number: 123,
    ballot_commitment: commitment,
  }]);

  const result = await updateSubmission(submissionId, {
    status: "pending",
    transaction_hash: transactionHash,
    block_number: 123,
  });

  assert.equal(result.submissionId, submissionId);
  assert.equal(result.voterRegNo, "NACOS-TEST-001");
  assert.equal(result.transactionHash, transactionHash);
  assert.equal(result.blockNumber, 123);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /unn_ballot_submissions/);
  assert.equal(calls[0].options.method, "PATCH");
});

test("recordSubmissionTransaction returns true only for an exact true RPC result", async () => {
  mockFetch(true);

  assert.equal(
    await recordSubmissionTransaction({
      submissionId,
      commitment,
      transactionHash,
    }),
    true,
  );
});

test("recordSubmissionTransaction treats a false RPC result as failure", async () => {
  mockFetch(false);

  assert.equal(
    await recordSubmissionTransaction({
      submissionId,
      commitment,
      transactionHash,
    }),
    false,
  );
});

test("finalizeSubmission returns true only for an exact true RPC result", async () => {
  mockFetch(true);

  assert.equal(
    await finalizeSubmission({
      submissionId,
      commitment,
      transactionHash,
      blockNumber: 123,
    }),
    true,
  );
});

test("finalizeSubmission treats a false RPC result as failure", async () => {
  mockFetch(false);

  assert.equal(
    await finalizeSubmission({
      submissionId,
      commitment,
      transactionHash,
      blockNumber: 123,
    }),
    false,
  );
});

test("Supabase errors propagate from persistence helpers", async () => {
  mockFetch(
    { message: "simulated database failure" },
    { ok: false, status: 500 },
  );

  await assert.rejects(
    finalizeSubmission({
      submissionId,
      commitment,
      transactionHash,
      blockNumber: 123,
    }),
    /simulated database failure/,
  );
});
