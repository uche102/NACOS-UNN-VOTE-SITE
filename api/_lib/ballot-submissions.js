import { getSingle, insertRows, supabaseRequest } from "./supabase.js";

function normalizeSubmission(row) {
  if (!row) return null;

  return {
    id: row.id,
    submissionId: row.submission_id,
    voterRegNo: row.voter_reg_no,
    ballotCiphertext: row.ballot_ciphertext,
    ballotCommitment: row.ballot_commitment,
    status: row.status,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    lastError: row.last_error,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

export async function findSubmissionByVoter(regNo) {
  const row = await getSingle("unn_ballot_submissions", {
    voter_reg_no: `eq.${regNo}`,
    select: "*",
  });

  return normalizeSubmission(row);
}

export async function findSubmissionById(submissionId) {
  const row = await getSingle("unn_ballot_submissions", {
    submission_id: `eq.${submissionId}`,
    select: "*",
  });

  return normalizeSubmission(row);
}

export async function createPendingSubmission({
  submissionId,
  voterRegNo,
  ballotCiphertext,
  ballotCommitment,
}) {
  const rows = await insertRows("unn_ballot_submissions", [{
    submission_id: submissionId,
    voter_reg_no: voterRegNo,
    ballot_ciphertext: ballotCiphertext,
    ballot_commitment: ballotCommitment,
    status: "pending",
  }]);

  return normalizeSubmission(rows?.[0] || null);
}

export async function updateSubmission(submissionId, changes) {
  const allowed = new Set([
    "status",
    "transaction_hash",
    "block_number",
    "last_error",
    "confirmed_at",
    "updated_at",
  ]);

  for (const key of Object.keys(changes)) {
    if (!allowed.has(key)) {
      throw new Error(`Unsupported submission field: ${key}`);
    }
  }

  const rows = await supabaseRequest("unn_ballot_submissions", {
    method: "PATCH",
    query: {
      submission_id: `eq.${submissionId}`,
      select: "*",
    },
    body: {
      ...changes,
      updated_at: new Date().toISOString(),
    },
  });

  return normalizeSubmission(rows?.[0] || null);
}

export async function claimPendingSubmission(submissionId) {
  const result = await supabaseRequest("rpc/claim_unn_ballot_submission", {
    method: "POST",
    body: { p_submission_id: submissionId },
  });

  return result === true;
}

export async function finalizeSubmission({
  submissionId,
  commitment,
  transactionHash,
  blockNumber,
}) {
  const result = await supabaseRequest(
    "rpc/finalize_unn_ballot_submission",
    {
      method: "POST",
      body: {
        p_submission_id: submissionId,
        p_commitment: commitment,
        p_transaction_hash: transactionHash,
        p_block_number: blockNumber,
      },
    }
  );

  return result === true;
}
export async function getSubmissionTransactionHash(submissionId) {
  const row = await getSingle("unn_ballot_submissions", {
    submission_id: `eq.${submissionId}`,
    select: "transaction_hash",
  });
  return row?.transaction_hash || null;
}

export async function recordSubmissionTransaction({
  submissionId,
  commitment,
  transactionHash,
}) {
  const result = await supabaseRequest(
    "rpc/record_unn_ballot_transaction",
    {
      method: "POST",
      body: {
        p_submission_id: submissionId,
        p_commitment: commitment,
        p_transaction_hash: transactionHash,
      },
    },
  );

  return result === true;
}