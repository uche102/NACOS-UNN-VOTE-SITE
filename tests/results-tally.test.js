import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.BALLOT_ENCRYPTION_KEY = randomBytes(32).toString("hex");

const { createBallotEnvelope } = await import("../api/_lib/ballot-crypto.js");
const { tallyConfirmedBallots } = await import("../api/_lib/results-tally.js");

const posts = [
  { id: "post-a", title: "President" },
  { id: "post-b", title: "Secretary" },
];

const candidates = [
  { id: "candidate-1", post_id: "post-a", name: "Candidate One" },
  { id: "candidate-2", post_id: "post-b", name: "Candidate Two" },
];

function submission(id, selections) {
  const envelope = createBallotEnvelope(id, selections);

  return {
    submission_id: id,
    ballot_ciphertext: envelope.ballotCiphertext,
    ballot_commitment: envelope.ballotCommitment,
  };
}

test("counts valid confirmed ballots and candidate votes", () => {
  const result = tallyConfirmedBallots(
    posts,
    candidates,
    [
      submission("ballot-1", { "post-a": ["candidate-1"] }),
      submission("ballot-2", { "post-a": ["candidate-1"], "post-b": ["candidate-2"] }),
    ],
  );

  assert.equal(result.countedBallots, 2);
  assert.equal(result.posts[0].candidates[0].votes, 2);
  assert.equal(result.posts[1].candidates[0].votes, 1);
});

test("rejects a candidate assigned to the wrong post", () => {
  assert.throws(
    () => tallyConfirmedBallots(
      posts,
      candidates,
      [submission("ballot-3", { "post-a": ["candidate-2"] })],
    ),
    /invalid candidate/i,
  );
});

test("rejects duplicate candidate selections", () => {
  assert.throws(
    () => tallyConfirmedBallots(
      posts,
      candidates,
      [submission("ballot-4", { "post-a": ["candidate-1", "candidate-1"] })],
    ),
    /duplicate candidate/i,
  );
});

test("rejects a tampered ballot envelope", () => {
  const ballot = submission("ballot-5", { "post-a": ["candidate-1"] });
  ballot.ballot_ciphertext = "{}";

  assert.throws(
    () => tallyConfirmedBallots(posts, candidates, [ballot]),
  );
});

test("rejects duplicate candidate IDs in election data", () => {
  assert.throws(
    () => tallyConfirmedBallots(
      posts,
      [
        ...candidates,
        { id: "candidate-1", post_id: "post-b", name: "Duplicate ID" },
      ],
      [],
    ),
    /duplicate candidate ID/i,
  );
});
