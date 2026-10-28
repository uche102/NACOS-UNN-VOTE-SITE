import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
} from "node:crypto";
import { ethers } from "ethers";

function getEncryptionKey() {
  const value = process.env.BALLOT_ENCRYPTION_KEY || "";

  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      "BALLOT_ENCRYPTION_KEY must be a 32-byte hexadecimal key."
    );
  }

  return Buffer.from(value, "hex");
}

export function createVoterIndex(regNo) {
  if (!regNo) {
    throw new Error("A voter registration number is required.");
  }

  return createHmac("sha256", getEncryptionKey())
    .update(`nacos-unn-ballot-voter:v1:${String(regNo).trim().toUpperCase()}`)
    .digest("hex");
}

function canonicalize(selections) {
  if (
    !selections ||
    typeof selections !== "object" ||
    Array.isArray(selections)
  ) {
    throw new Error("Invalid ballot selections.");
  }

  const normalized = Object.keys(selections)
    .sort()
    .map((postId) => {
      const value = selections[postId];
      const ids = (Array.isArray(value) ? value : [value])
        .filter(Boolean)
        .map(String)
        .sort();

      return [String(postId), ids];
    });

  return JSON.stringify(normalized);
}

function commitmentFor(submissionId, salt, ballot) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify({
        submissionId: String(submissionId),
        salt,
        ballot,
      })
    )
  );
}

export function createBallotEnvelope(submissionId, selections) {
  const key = getEncryptionKey();
  const salt = randomBytes(32).toString("hex");
  const ballot = canonicalize(selections);

  // This hash checks ballot integrity; it does not hide the votes.
  const ballotCommitment = commitmentFor(submissionId, salt, ballot);
  const iv = randomBytes(12);
  // Encrypt the ballot. The server holds the key and can read it.
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  cipher.setAAD(Buffer.from(String(submissionId)));

  const plaintext = Buffer.from(
    JSON.stringify({ submissionId: String(submissionId), salt, ballot })
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  return {
    ballotCiphertext: JSON.stringify({
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
    ballotCommitment,
  };
}

export function decryptBallotEnvelope(
  submissionId,
  storedEnvelope,
  expectedCommitment
) {
  const key = getEncryptionKey();
  const envelope =
    typeof storedEnvelope === "string"
      ? JSON.parse(storedEnvelope)
      : storedEnvelope;

  if (
    envelope?.version !== 1 ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.ciphertext
  ) {
    throw new Error("Invalid ballot encryption envelope.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64")
  );

  decipher.setAAD(Buffer.from(String(submissionId)));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);

  const payload = JSON.parse(plaintext.toString("utf8"));

  if (payload.submissionId !== String(submissionId)) {
    throw new Error("Ballot submission ID mismatch.");
  }

  const actualCommitment = commitmentFor(
    submissionId,
    payload.salt,
    payload.ballot
  );

  if (
    typeof expectedCommitment !== "string" ||
    actualCommitment.toLowerCase() !== expectedCommitment.toLowerCase()
  ) {
    throw new Error("Ballot commitment verification failed.");
  }

  return {
    ballot: JSON.parse(payload.ballot),
    salt: payload.salt,
    commitmentValid: true,
  };
}

export function fingerprintBallot(selections) {
  return createHash("sha256")
    .update(canonicalize(selections))
    .digest("hex");
}
