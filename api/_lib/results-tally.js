import { decryptBallotEnvelope } from "./ballot-crypto.js";

export function tallyConfirmedBallots(posts, candidatesRows, submissions) {
  const resultPosts = posts.map((post) => ({
    ...post,
    candidates: candidatesRows
      .filter((candidate) => candidate.post_id === post.id)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        votes: 0,
      })),
  }));

  const candidateById = new Map();

  for (const post of resultPosts) {
    for (const candidate of post.candidates) {
      if (candidateById.has(candidate.id)) {
        throw new Error("Duplicate candidate ID in election data.");
      }
      candidateById.set(candidate.id, {
        candidate,
        postId: post.id,
      });
    }
  }

  let countedBallots = 0;

  for (const submission of submissions) {
    const recovered = decryptBallotEnvelope(
      submission.submission_id,
      submission.ballot_ciphertext,
      submission.ballot_commitment,
    );

    if (!recovered.commitmentValid || !Array.isArray(recovered.ballot)) {
      throw new Error("A confirmed ballot failed verification.");
    }

    const selectionsInBallot = new Set();

    for (const entry of recovered.ballot) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error("A ballot contains invalid selection data.");
      }

      const [postId, candidateIds] = entry;

      if (typeof postId !== "string" || !Array.isArray(candidateIds)) {
        throw new Error("A ballot contains invalid candidate selections.");
      }

      for (const candidateId of candidateIds) {
        if (typeof candidateId !== "string") {
          throw new Error("A ballot contains an invalid candidate ID.");
        }

        const found = candidateById.get(candidateId);

        if (!found || found.postId !== postId) {
          throw new Error("A ballot references an invalid candidate.");
        }

        if (selectionsInBallot.has(candidateId)) {
          throw new Error("A ballot contains a duplicate candidate.");
        }

        selectionsInBallot.add(candidateId);
        found.candidate.votes += 1;
      }
    }

    countedBallots += 1;
  }

  return { posts: resultPosts, countedBallots };
}
