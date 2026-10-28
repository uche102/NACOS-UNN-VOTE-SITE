import "dotenv/config";
import { ethers } from "ethers";

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL;
const CONTRACT_ADDRESS = process.env.NACOS_ELECTION_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;
const VOTER_SECRET = process.env.BLOCKCHAIN_VOTER_SECRET;

const ABI = [
  "function recordBallot(bytes32 voterHash, bytes32[] postIds, bytes32[] candidateIds)",
  "function hasVoterVoted(bytes32 voterHash) view returns (bool)",
  "function getVoteCount(bytes32 postId, bytes32 candidateId) view returns (uint256)",
  "function electionActive() view returns (bool)",
];

function assertConfig() {
  if (!RPC_URL) {
    throw new Error("BLOCKCHAIN_RPC_URL is not configured.");
  }

  if (!CONTRACT_ADDRESS) {
    throw new Error("NACOS_ELECTION_CONTRACT_ADDRESS is not configured.");
  }

  if (!PRIVATE_KEY) {
    throw new Error("BLOCKCHAIN_PRIVATE_KEY is not configured.");
  }

  if (!VOTER_SECRET) {
    throw new Error("BLOCKCHAIN_VOTER_SECRET is not configured.");
  }
}

function getContract() {
  assertConfig();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  return new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
}

export function createVoterHash(regNo) {
  assertConfig();

  return ethers.keccak256(
    ethers.solidityPacked(
      ["string", "string"],
      [String(regNo), VOTER_SECRET],
    ),
  );
}

function hashId(value) {
  return ethers.id(String(value));
}

export async function recordBallot({
  regNo,
  postIds,
  candidateIds,
}) {
  if (!Array.isArray(postIds) || !Array.isArray(candidateIds)) {
    throw new Error("postIds and candidateIds must be arrays.");
  }

  if (postIds.length === 0) {
    throw new Error("Ballot cannot be empty.");
  }

  if (postIds.length !== candidateIds.length) {
    throw new Error("postIds and candidateIds must have the same length.");
  }

  const contract = getContract();

  const voterHash = createVoterHash(regNo);
  const blockchainPostIds = postIds.map(hashId);
  const blockchainCandidateIds = candidateIds.map(hashId);

  const alreadyVoted = await contract.hasVoterVoted(voterHash);

  if (alreadyVoted) {
    throw new Error("This voter has already voted on the blockchain.");
  }

  const tx = await contract.recordBallot(
    voterHash,
    blockchainPostIds,
    blockchainCandidateIds,
  );

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Blockchain transaction failed.");
  }

  return {
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber,
    voterHash,
  };
}

export async function getBlockchainInfo() {
  assertConfig();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();

  return {
    chainId: network.chainId.toString(),
    contractAddress: CONTRACT_ADDRESS,
    authority: await wallet.getAddress(),
  };
}
