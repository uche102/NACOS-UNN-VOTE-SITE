import "dotenv/config";
import { insertRows, getSingle } from "../api/_lib/supabase.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed test voters in production.");
}

if (process.env.ALLOW_DEV_VOTER_SEED !== "true") {
  throw new Error("Set ALLOW_DEV_VOTER_SEED=true in local .env first.");
}

const voters = [
  {
    reg_no: "NACOS-TEST-001",
    name: "Test Voter One",
    email: "test-voter-001@example.invalid",
    phone_number: "0000000001",
    level: "400",
  },
  {
    reg_no: "NACOS-TEST-002",
    name: "Test Voter Two",
    email: "test-voter-002@example.invalid",
    phone_number: "0000000002",
    level: "400",
  },
  {
    reg_no: "NACOS-TEST-003",
    name: "Test Voter Three",
    email: "test-voter-003@example.invalid",
    phone_number: "0000000003",
    level: "400",
  },
];

for (const voter of voters) {
  const existing = await getSingle("voters", {
    reg_no: `eq.${voter.reg_no}`,
  });

  if (existing) {
    throw new Error(
      `Test voter ${voter.reg_no} already exists. No records were inserted.`,
    );
  }
}

await insertRows("voters", voters);
console.log(`Inserted ${voters.length} fictional local test voters.`);
