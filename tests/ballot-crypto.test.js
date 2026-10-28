import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.BALLOT_ENCRYPTION_KEY = randomBytes(32).toString("hex");

const {
  createVoterIndex,
  createBallotEnvelope,
  decryptBallotEnvelope,
  fingerprintBallot,
} = await import("../api/_lib/ballot-crypto.js");

const selections = {
  "post-a": ["candidate-1"],
  "post-b": ["candidate-2", "candidate-3"],
};

test("encrypted ballot can be recovered and verified", () => {
  const id = "test-submission-1";
  const envelope = createBallotEnvelope(id, selections);

  const recovered = decryptBallotEnvelope(
    id,
    envelope.ballotCiphertext,
    envelope.ballotCommitment
  );

  assert.equal(recovered.commitmentValid, true);
  assert.deepEqual(recovered.ballot, [
    ["post-a", ["candidate-1"]],
    ["post-b", ["candidate-2", "candidate-3"]],
  ]);
});

test("ciphertext does not contain candidate IDs in plaintext", () => {
  const envelope = createBallotEnvelope("test-submission-2", selections);

  assert.equal(envelope.ballotCiphertext.includes("candidate-1"), false);
  assert.equal(envelope.ballotCiphertext.includes("candidate-2"), false);
});

test("incorrect commitment is rejected", () => {
  const envelope = createBallotEnvelope("test-submission-3", selections);
  const wrongCommitment = `0x${"00".repeat(32)}`;

  assert.throws(
    () => decryptBallotEnvelope(
      "test-submission-3",
      envelope.ballotCiphertext,
      wrongCommitment
    )
  );
});

test("wrong submission ID is rejected", () => {
  const envelope = createBallotEnvelope("test-submission-4", selections);

  assert.throws(
    () => decryptBallotEnvelope(
      "different-submission",
      envelope.ballotCiphertext,
      envelope.ballotCommitment
    )
  );
});

test("selection fingerprints are stable regardless of object key order", () => {
  const first = { "post-a": ["candidate-1"], "post-b": ["candidate-2"] };
  const second = { "post-b": ["candidate-2"], "post-a": ["candidate-1"] };

  assert.equal(fingerprintBallot(first), fingerprintBallot(second));
});

test("voter indexes are stable and normalize registration number casing", () => {
  assert.equal(
    createVoterIndex("NACOS-TEST-001"),
    createVoterIndex(" nacos-test-001 "),
  );
  assert.notEqual(
    createVoterIndex("NACOS-TEST-001"),
    createVoterIndex("NACOS-TEST-002"),
  );
  assert.doesNotMatch(
    createVoterIndex("NACOS-TEST-001"),
    /NACOS-TEST-001/,
  );
});
