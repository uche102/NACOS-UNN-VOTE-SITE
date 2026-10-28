# NACOS-UNN election contract

`NACOSUNNElection` is a small, authority-controlled on-chain registry for ballot
commitments. It does not store candidate selections, tally votes, or decide who is
eligible to vote.

## Contract behavior

- The account that deploys the contract becomes the election authority.
- The election starts inactive. Only the authority can activate or deactivate it.
- The backend election-status control sends activation changes to the contract.
  Configure `BLOCKCHAIN_PRIVATE_KEY` with the deploying authority account; ballot
  submission and status changes are restricted to Sepolia.
- While active, only the authority can record a submission, identified by a
  nonzero `bytes32` ID, with a nonzero `bytes32` commitment.
- A submission ID can be recorded only once. The contract stores the ID's
  recorded status and its commitment, then emits `BallotCommitted`.
- Anyone can read the public state and transaction events. A commitment is a
  hash, not encryption: privacy depends on how the off-chain application
  constructs it and keeps any secret material safe.

Voter eligibility, prevention of multiple votes by one voter, ballot validation,
and tallying are outside this contract and must be handled elsewhere. The
authority is fixed at deployment; this contract has no authority-transfer
function.

## Tests

From this directory, run:

```sh
npx hardhat test
```
