import { randomUUID } from "node:crypto";
import { json, methodNotAllowed, readBody } from "./_lib/http.js";
import { getElectionStatus } from "./_lib/election-status.js";
import { inferEligibleLevel } from "./_lib/post-order.js";
import { requireVoter } from "./_lib/session.js";
import { getSingle, supabaseRequest } from "./_lib/supabase.js";
import {
  createBallotEnvelope,
  decryptBallotEnvelope,
} from "./_lib/ballot-crypto.js";
import {
  findSubmissionByVoter,
  createPendingSubmission,
  getSubmissionTransactionHash,
  recordSubmissionTransaction,
  finalizeSubmission,
} from "./_lib/ballot-submissions.js";
import { recordBallotCommitment } from "./_lib/blockchain.js";

function normalizeLevel(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/LEVEL$/, "L")
    .replace(/LVL$/, "L");

  return /^(200|300|400|500)$/.test(normalized)
    ? `${normalized}L`
    : normalized;
}

function isHorPost(post) {
  const title = String(post?.title || "").toLowerCase();
  return title.includes("hor") ||
    title.includes("house of rep") ||
    title.includes("house of representative");
}

function canonicalSelections(selections) {
  return JSON.stringify(
    Object.entries(selections)
      .map(([postId, value]) => [
        String(postId),
        (Array.isArray(value) ? value : [value])
          .filter(Boolean)
          .map(String)
          .sort(),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const voter = requireVoter(req, res);
    if (!voter) return;

    const status = await getElectionStatus();
    if (!status.votingOpen) {
      return json(res, 403, { error: "Voting is currently closed." });
    }

    const body = await readBody(req);
    const selections = body?.selections;

    if (
      !selections ||
      typeof selections !== "object" ||
      Array.isArray(selections)
    ) {
      return json(res, 400, { error: "Vote selections are required." });
    }

    const voterRecord = voter.level
      ? voter
      : await getSingle("voters", {
          reg_no: `eq.${voter.reg_no}`,
          select: "*",
        });

    if (!voterRecord) {
      return json(res, 404, { error: "Voter not found." });
    }

    let posts;
    try {
      posts = await supabaseRequest("posts", {
        query: {
          select: "id,title,eligible_level",
          is_active: "eq.true",
          title: "not.like.__NACOS_UNN_ELECTION_CONTROL__:%",
        },
      });
    } catch (error) {
      if (!String(error.message || "").includes("eligible_level")) throw error;
      posts = await supabaseRequest("posts", {
        query: {
          select: "id,title",
          is_active: "eq.true",
          title: "not.like.__NACOS_UNN_ELECTION_CONTROL__:%",
        },
      });
    }

    const voterLevel = normalizeLevel(voterRecord.level);
    const eligiblePosts = posts.filter((post) => {
      const level = normalizeLevel(inferEligibleLevel(post));
      return !level || level === voterLevel;
    });

    const requiredPostIds = eligiblePosts.map((post) => String(post.id));
    const selectedPostIds = Object.keys(selections);

    if (
      requiredPostIds.length === 0 ||
      selectedPostIds.length !== requiredPostIds.length ||
      requiredPostIds.some((id) => !selectedPostIds.includes(id))
    ) {
      return json(res, 400, {
        error: "Please vote for every post available to your level.",
      });
    }

    const exceedsHorLimit = eligiblePosts.some((post) => {
      if (!isHorPost(post) || voterLevel !== "200L") return false;
      const value = selections[post.id];
      const chosen = Array.isArray(value)
        ? value.filter(Boolean)
        : value ? [value] : [];
      return chosen.length > 5;
    });

    if (exceedsHorLimit) {
      return json(res, 400, {
        error: "200 level voters can only select a maximum of 5 HOR candidates.",
      });
    }

    const ballot = Object.entries(selections).map(([postId, value]) => ({
      postId: String(postId),
      candidateIds: (Array.isArray(value) ? value : [value])
        .filter(Boolean)
        .map(String),
    }));

    if (ballot.some((item) => item.candidateIds.length === 0)) {
      return json(res, 400, {
        error: "Please select at least one candidate for every post.",
      });
    }

    const candidateIds = [
      ...new Set(ballot.flatMap((item) => item.candidateIds)),
    ];

    const candidates = await supabaseRequest("candidates", {
      query: {
        select: "id,post_id,is_active",
        id: `in.(${candidateIds.join(",")})`,
        is_active: "eq.true",
      },
    });

    const validSelections = ballot.every((item) =>
      item.candidateIds.every((candidateId) =>
        candidates.some((candidate) =>
          String(candidate.id) === candidateId &&
          String(candidate.post_id) === item.postId &&
          candidate.is_active === true
        )
      )
    );

    if (!validSelections) {
      return json(res, 400, {
        error: "One or more selected candidates are invalid.",
      });
    }

    let submission = await findSubmissionByVoter(voter.reg_no);

    if (submission?.status === "confirmed") {
      return json(res, 409, {
        error: "This voter has already submitted a ballot.",
      });
    }

    if (!submission) {
      const submissionId = randomUUID();
      const envelope = createBallotEnvelope(submissionId, selections);

      try {
        submission = await createPendingSubmission({
          submissionId,
          voterRegNo: voter.reg_no,
          ballotCiphertext: envelope.ballotCiphertext,
          ballotCommitment: envelope.ballotCommitment,
        });
      } catch (error) {
        // A concurrent request may have created the unique voter submission.
        submission = await findSubmissionByVoter(voter.reg_no);
        if (!submission) throw error;
      }
    }

    if (!submission) {
      throw new Error("Could not create or recover the ballot submission.");
    }

    // Never replace an existing ballot during a retry.
    const recovered = decryptBallotEnvelope(
      submission.submissionId,
      submission.ballotCiphertext,
      submission.ballotCommitment,
    );

    if (!recovered.commitmentValid) {
      throw new Error("Stored ballot commitment verification failed.");
    }

    if (
      canonicalSelections(selections) !==
      JSON.stringify(recovered.ballot)
    ) {
      return json(res, 409, {
        error: "A different ballot is already pending for this voter. Contact the election administrator for recovery.",
      });
    }

    const existingTransactionHash = await getSubmissionTransactionHash(
      submission.submissionId
    );

    const blockchain = await recordBallotCommitment({
      submissionId: submission.submissionId,
      commitment: submission.ballotCommitment,
      existingTransactionHash,
      onBroadcast: async (transactionHash) => {
        const saved = await recordSubmissionTransaction({
          submissionId: submission.submissionId,
          commitment: submission.ballotCommitment,
          transactionHash,
        });

        if (!saved) {
          throw new Error("Transaction hash persistence was not confirmed.");
        }
      },
    });

    // Also persist recovered transactions, where no new broadcast occurred.
    const savedHash = await recordSubmissionTransaction({
      submissionId: submission.submissionId,
      commitment: submission.ballotCommitment,
      transactionHash: blockchain.transactionHash,
    });

    if (!savedHash) {
      throw new Error("Could not persist the blockchain transaction reference.");
    }

    const finalized = await finalizeSubmission({
      submissionId: submission.submissionId,
      commitment: submission.ballotCommitment,
      transactionHash: blockchain.transactionHash,
      blockNumber: blockchain.blockNumber,
    });

    if (!finalized) {
      throw new Error("Transaction is recorded but submission finalization needs recovery.");
    }

    await supabaseRequest("voters", {
      method: "PATCH",
      query: { reg_no: `eq.${voter.reg_no}` },
      body: { ballot_submitted_at: new Date().toISOString() },
    });

    return json(res, 201, {
      message: "Ballot commitment confirmed on the blockchain.",
      transactionHash: blockchain.transactionHash,
      blockNumber: blockchain.blockNumber,
    });
  } catch (error) {
    console.error("Ballot submission failed:", error.message);
    return json(res, 500, {
      error: "Ballot submission could not be completed. Check its status before retrying.",
    });
  }
}
