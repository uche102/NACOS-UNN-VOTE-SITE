import "dotenv/config";
import { ethers } from "ethers";

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL;
const CONTRACT_ADDRESS = process.env.NACOS_ELECTION_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;

const ABI = [
  "function recordBallot(bytes32 submissionId, bytes32 commitment)",
  "function submissionRecorded(bytes32 submissionId) view returns (bool)",
  "function ballotCommitments(bytes32 submissionId) view returns (bytes32)",
  "function electionActive() view returns (bool)",
  "function setElectionActive(bool active)",
  "event BallotCommitted(bytes32 indexed submissionId, bytes32 commitment, uint256 timestamp)",
];

function assertConfig() {
  if (!RPC_URL) throw new Error("BLOCKCHAIN_RPC_URL is not configured.");
  if (!CONTRACT_ADDRESS) {
    throw new Error("NACOS_ELECTION_CONTRACT_ADDRESS is not configured.");
  }
  if (!PRIVATE_KEY) {
    throw new Error("BLOCKCHAIN_PRIVATE_KEY is not configured.");
  }
}

function getProvider() {
  assertConfig();
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getContract() {
  const provider = getProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
}

export function toBytes32Id(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(value)));
}

export async function setBlockchainElectionActiveWithDependencies({
  contract,
  provider,
  active,
}) {
  if (typeof active !== "boolean") {
    throw new Error("Election active status must be true or false.");
  }

  if (!contract || !provider) {
    throw new Error("A contract and provider are required.");
  }

  const { chainId } = await provider.getNetwork();
  if (chainId !== 11155111n) {
    throw new Error("Refusing to update: blockchain network is not Sepolia.");
  }

  if (await contract.electionActive() === active) {
    return { active, alreadySet: true };
  }

  const tx = await contract.setElectionActive(active);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(
      `Blockchain election status transaction ${tx.hash} was not confirmed successfully.`
    );
  }

  if (await contract.electionActive() !== active) {
    throw new Error(
      `Blockchain election status did not change after transaction ${tx.hash}.`
    );
  }

  return {
    active,
    alreadySet: false,
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function setBlockchainElectionActive(active) {
  const contract = getContract();

  return setBlockchainElectionActiveWithDependencies({
    contract,
    provider: contract.runner.provider,
    active,
  });
}

async function findRecordedTransaction(contract, submissionId, commitment) {
  const filter = contract.filters.BallotCommitted(submissionId);
  const events = await contract.queryFilter(filter, 0, "latest");
  const matching = events.filter(
    (event) =>
      String(event.args?.commitment).toLowerCase() === commitment.toLowerCase()
  );

  if (matching.length === 0) return null;

  const event = matching[matching.length - 1];
  return {
    transactionHash: event.transactionHash,
    blockNumber: event.blockNumber,
  };
}

export async function recordBallotCommitmentWithDependencies({
  contract,
  provider,
  submissionId,
  commitment,
  onBroadcast,
  existingTransactionHash = null,
}) {
  if (!submissionId || !ethers.isHexString(commitment, 32)) {
    throw new Error("A submission ID and bytes32 commitment are required.");
  }

  if (!contract || !provider) {
    throw new Error("A contract and provider are required.");
  }

  const { chainId } = await provider.getNetwork();

  if (chainId !== 11155111n) {
    throw new Error("Refusing to submit: blockchain network is not Sepolia.");
  }

  const id = toBytes32Id(submissionId);
  const expectedCommitment = commitment.toLowerCase();

  const alreadyRecorded = await contract.submissionRecorded(id);

  if (alreadyRecorded) {
    const stored = await contract.ballotCommitments(id);

    if (stored.toLowerCase() !== expectedCommitment) {
      throw new Error(
        "Submission ID already exists with a different commitment."
      );
    }

    const transaction = await findRecordedTransaction(
      contract,
      id,
      stored
    );

    if (!transaction) {
      throw new Error(
        "Submission exists on-chain, but its transaction event could not be recovered."
      );
    }

    return {
      alreadyRecorded: true,
      submissionId: id,
      commitment: stored,
      transactionHash: transaction.transactionHash,
      blockNumber: transaction.blockNumber,
    };
  }

  if (existingTransactionHash) {
    const receipt = await provider.getTransactionReceipt(existingTransactionHash);

    if (receipt) {
      if (receipt.status !== 1) {
        throw new Error(
          `Previously broadcast transaction ${existingTransactionHash} failed. Review it before retrying.`
        );
      }

      if (await contract.submissionRecorded(id)) {
        const stored = await contract.ballotCommitments(id);

        if (stored.toLowerCase() !== expectedCommitment) {
          throw new Error("Existing transaction recorded a different commitment.");
        }

        return {
          alreadyRecorded: true,
          submissionId: id,
          commitment: stored,
          transactionHash: existingTransactionHash,
          blockNumber: receipt.blockNumber,
        };
      }

      throw new Error(
        `Transaction ${existingTransactionHash} succeeded but contract state is inconsistent. Do not rebroadcast.`
      );
    }

    const pending = await provider.getTransaction(existingTransactionHash);

    if (pending) {
      throw new Error(
        `Transaction ${existingTransactionHash} is still pending. Do not submit another transaction.`
      );
    }

    throw new Error(
      `Transaction ${existingTransactionHash} cannot be found. Its status is uncertain; do not automatically rebroadcast.`
    );
  }

  if (!(await contract.electionActive())) {
    throw new Error("The on-chain election is inactive.");
  }

  const tx = await contract.recordBallot(id, expectedCommitment);

  if (onBroadcast) {
    try {
      await onBroadcast(tx.hash);
    } catch {
      throw new Error(
        `Transaction ${tx.hash} was broadcast, but saving its reference failed. Check this transaction before retrying.`
      );
    }
  }

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error(
      `Blockchain transaction ${tx.hash} was not confirmed successfully.`
    );
  }

  return {
    alreadyRecorded: false,
    submissionId: id,
    commitment: expectedCommitment,
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}


export async function recordBallotCommitment(args) {
  const contract = getContract();

  return recordBallotCommitmentWithDependencies({
    ...args,
    contract,
    provider: contract.runner.provider,
  });
}

export async function getBlockchainInfo() {
  assertConfig();

  const provider = getProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const network = await provider.getNetwork();

  return {
    chainId: network.chainId.toString(),
    contractAddress: CONTRACT_ADDRESS,
    authority: await wallet.getAddress(),
  };
}
