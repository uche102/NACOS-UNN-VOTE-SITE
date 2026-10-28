import test from "node:test";
import assert from "node:assert/strict";
import {
  recordBallotCommitmentWithDependencies,
  setBlockchainElectionActiveWithDependencies,
  toBytes32Id,
} from "../api/_lib/blockchain.js";

const submissionId = "local-recovery-test";
const id = toBytes32Id(submissionId);
const commitment = `0x${"11".repeat(32)}`;
const txHash = `0x${"22".repeat(32)}`;

function setup(options = {}) {
  const calls = { broadcast: 0, queryFilter: 0 };
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
    getTransactionReceipt: async () => options.receipt ?? null,
    getTransaction: async () => options.pending ?? null,
  };

  let recordedCalls = 0;
  const contract = {
    runner: { provider },
    submissionRecorded: async () => {
      recordedCalls++;
      return typeof options.recorded === "function"
        ? options.recorded(recordedCalls)
        : Boolean(options.recorded);
    },
    ballotCommitments: async () => options.storedCommitment ?? commitment,
    electionActive: async () => options.active ?? true,
    filters: { BallotCommitted: (value) => ({ submissionId: value }) },
    queryFilter: async () => {
      calls.queryFilter++;
      return options.events ?? [];
    },
    recordBallot: async () => {
      calls.broadcast++;
      return {
        hash: txHash,
        wait: async () => options.waitResult ?? { status: 1, blockNumber: 42 },
      };
    },
  };

  return { provider, contract, calls };
}

async function recover(env, extra = {}) {
  return recordBallotCommitmentWithDependencies({
    provider: env.provider,
    contract: env.contract,
    submissionId,
    commitment,
    ...extra,
  });
}

test("recovers an already-recorded matching commitment", async () => {
  const env = setup({
    recorded: true,
    events: [{
      args: { commitment },
      transactionHash: txHash,
      blockNumber: 42,
    }],
  });

  const result = await recover(env);
  assert.equal(result.alreadyRecorded, true);
  assert.equal(result.transactionHash, txHash);
  assert.equal(env.calls.broadcast, 0);
});

test("rejects a recorded submission with a different commitment", async () => {
  const env = setup({
    recorded: true,
    storedCommitment: `0x${"33".repeat(32)}`,
  });

  await assert.rejects(recover(env), /different commitment/i);
  assert.equal(env.calls.broadcast, 0);
});

test("does not rebroadcast a pending transaction", async () => {
  const env = setup({ pending: { hash: txHash } });

  await assert.rejects(
    recover(env, { existingTransactionHash: txHash }),
    /still pending/i,
  );
  assert.equal(env.calls.broadcast, 0);
});

test("does not silently retry a failed transaction", async () => {
  const env = setup({ receipt: { status: 0 } });

  await assert.rejects(
    recover(env, { existingTransactionHash: txHash }),
    /previously broadcast transaction.*failed/i,
  );
  assert.equal(env.calls.broadcast, 0);
});

test("does not rebroadcast when transaction status is uncertain", async () => {
  const env = setup();

  await assert.rejects(
    recover(env, { existingTransactionHash: txHash }),
    /status is uncertain/i,
  );
  assert.equal(env.calls.broadcast, 0);
});

test("rejects a successful receipt with inconsistent contract state", async () => {
  const env = setup({ receipt: { status: 1, blockNumber: 42 } });

  await assert.rejects(
    recover(env, { existingTransactionHash: txHash }),
    /state is inconsistent/i,
  );
  assert.equal(env.calls.broadcast, 0);
});

test("does not broadcast while election is inactive", async () => {
  const env = setup({ active: false });

  await assert.rejects(recover(env), /election is inactive/i);
  assert.equal(env.calls.broadcast, 0);
});

test("reports broadcast if saving its transaction hash fails", async () => {
  const env = setup();

  await assert.rejects(
    recover(env, {
      onBroadcast: async () => {
        throw new Error("simulated persistence failure");
      },
    }),
    /was broadcast, but saving its reference failed/i,
  );

  assert.equal(env.calls.broadcast, 1);
});

test("confirms a new mocked transaction when persistence succeeds", async () => {
  const env = setup();
  let savedHash = null;

  const result = await recover(env, {
    onBroadcast: async (hash) => {
      savedHash = hash;
    },
  });

  assert.equal(savedHash, txHash);
  assert.equal(result.alreadyRecorded, false);
  assert.equal(result.transactionHash, txHash);
  assert.equal(result.blockNumber, 42);
  assert.equal(env.calls.broadcast, 1);
});

test("refuses a non-Sepolia network before broadcasting", async () => {
  const env = setup();
  env.provider.getNetwork = async () => ({ chainId: 1n });

  await assert.rejects(recover(env), /not Sepolia/i);
  assert.equal(env.calls.broadcast, 0);
});

test("updates on-chain election status and waits for confirmation", async () => {
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
  };
  let active = false;
  let calls = 0;
  const contract = {
    electionActive: async () => active,
    setElectionActive: async (value) => {
      calls++;
      return {
        hash: txHash,
        wait: async () => {
          active = value;
          return { status: 1, blockNumber: 43 };
        },
      };
    },
  };

  const result = await setBlockchainElectionActiveWithDependencies({
    contract,
    provider,
    active: true,
  });

  assert.equal(result.active, true);
  assert.equal(result.transactionHash, txHash);
  assert.equal(result.blockNumber, 43);
  assert.equal(calls, 1);
});

test("does not send an election status transaction when already synchronized", async () => {
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }),
  };
  const contract = {
    electionActive: async () => true,
    setElectionActive: async () => {
      throw new Error("should not send transaction");
    },
  };

  const result = await setBlockchainElectionActiveWithDependencies({
    contract,
    provider,
    active: true,
  });

  assert.equal(result.alreadySet, true);
});
