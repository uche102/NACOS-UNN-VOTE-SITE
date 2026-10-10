import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local Hardhat RPC during development.
// We will change this when we deploy to a real testnet.
const RPC_URL =
  process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";

const CONTRACT_ADDRESS =
  process.env.NACOS_ELECTION_CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// The private key belongs to the election-authority wallet.
// DO NOT use a real/private-network key here.
const AUTHORITY_PRIVATE_KEY =
  process.env.BLOCKCHAIN_PRIVATE_KEY;

if (!AUTHORITY_PRIVATE_KEY) {
  throw new Error(
    "BLOCKCHAIN_PRIVATE_KEY is not configured."
  );
}

// Hardhat generates the ABI here after compilation.
const artifactPath = path.resolve(
  __dirname,
  "../artifacts/contracts/NACOSUNNElection.sol/NACOSUNNElection.json"
);

if (!fs.existsSync(artifactPath)) {
  throw new Error(
    `NACOSUNNElection artifact not found: ${artifactPath}`
  );
}

const artifact = JSON.parse(
  fs.readFileSync(artifactPath, "utf8")
);

const provider = new ethers.JsonRpcProvider(RPC_URL);

const wallet = new ethers.Wallet(
  AUTHORITY_PRIVATE_KEY,
  provider
);

const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  artifact.abi,
  wallet
);

/**
 * Convert a Supabase UUID/string into bytes32.
 */
export function hashId(value) {
  return ethers.id(String(value));
}

/**
 * Create the private voter identifier used by the blockchain.
 *
 * IMPORTANT:
 * We do not put the raw registration number on-chain.
 */
export function createVoterHash(regNo, electionSecret) {
  if (!electionSecret) {
    throw new Error(
      "BLOCKCHAIN_VOTER_SECRET is not configured."
    );
  }

  return ethers.keccak256(
    ethers.solidityPacked(
      ["string", "string"],
      [String(regNo), String(electionSecret)]
    )
  );
}

/**
 * Record an entire ballot on the blockchain.
 *
 * postIds and candidateIds must have the same length.
 */
export async function recordBallot({
  voterHash,
  postIds,
  candidateIds,
}) {
  if (!voterHash) {
    throw new Error("voterHash is required.");
  }

  if (!Array.isArray(postIds) || !Array.isArray(candidateIds)) {
    throw new Error(
      "postIds and candidateIds must be arrays."
    );
  }

  if (postIds.length === 0) {
    throw new Error("Ballot cannot be empty.");
  }

  if (postIds.length !== candidateIds.length) {
    throw new Error(
      "postIds and candidateIds must have the same length."
    );
  }

  const blockchainPostIds = postIds.map(hashId);
  const blockchainCandidateIds = candidateIds.map(hashId);

  // Submit the ballot to the smart contract.
  const tx = await contract.recordBallot(
    voterHash,
    blockchainPostIds,
    blockchainCandidateIds
  );

  // Wait until the blockchain confirms the transaction.
  const receipt = await tx.wait();

  return {
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
  };
}

/**
 * Check whether a voter has already voted on-chain.
 */
export async function hasVoted(voterHash) {
  return contract.hasVoterVoted(voterHash);
}

/**
 * Read the blockchain vote count for a candidate/post pair.
 */
export async function getVoteCount(postId, candidateId) {
  return contract.getVoteCount(
    hashId(postId),
    hashId(candidateId)
  );
}

/**
 * Return basic blockchain connection information.
 */
export async function getBlockchainInfo() {
  const network = await provider.getNetwork();
  const authority = await wallet.getAddress();

  return {
    rpcUrl: RPC_URL,
    chainId: network.chainId.toString(),
    contractAddress: CONTRACT_ADDRESS,
    authority,
  };
}