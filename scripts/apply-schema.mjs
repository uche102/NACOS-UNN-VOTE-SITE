import { spawn } from "node:child_process";
import process from "node:process";
import "dotenv/config";

function buildCandidateConnections() {
  const explicitConnectionString =
    process.env.SUPABASE_SESSION_POOLER_URL ||
    process.env.SUPABASE_PSQL_URL ||
    process.env.SUPABASE_DB_URL ||
    "";

  const candidates = [];
  if (explicitConnectionString) {
    candidates.push(explicitConnectionString);
  }

  const directMatch = explicitConnectionString.match(
    /postgres(?:ql)?:\/\/[^@]+@db\.([^.]+)\.supabase\.co/,
  );
  const projectRef = directMatch?.[1];

  if (projectRef) {
    const poolerHosts = [
      "aws-0-eu-west-1.pooler.supabase.com",
      "aws-0-us-east-1.pooler.supabase.com",
      "aws-0-eu-central-1.pooler.supabase.com",
      "aws-0-ap-southeast-1.pooler.supabase.com",
      "aws-0-ap-northeast-1.pooler.supabase.com",
      "aws-0-us-west-1.pooler.supabase.com",
    ];

    const baseUrl = explicitConnectionString.replace(
      /@db\.[^.]+\.supabase\.co/,
      "@__HOST__",
    );

    for (const host of poolerHosts) {
      candidates.push(
        baseUrl.replace("__HOST__", host).replace(/:5432\//, ":6543/"),
      );
    }
  }

  return Array.from(new Set(candidates));
}

function runMigration(connectionString) {
  return new Promise((resolve, reject) => {
    const args = [connectionString, "-f", "supabase/schema.sql"];
    const child = spawn("psql", args, {
      stdio: "inherit",
      env: {
        ...process.env,
        PGSSLMODE: process.env.PGSSLMODE || "require",
        PGHOSTADDR: process.env.PGHOSTADDR || "",
      },
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`psql exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const candidates = buildCandidateConnections();

  if (!candidates.length) {
    console.error(
      "Missing connection string. Set SUPABASE_PSQL_URL or SUPABASE_SESSION_POOLER_URL to the Supabase session pooler URL from the Connect panel.",
    );
    process.exit(1);
  }

  let lastError;
  for (const connectionString of candidates) {
    try {
      console.log(
        `Applying schema with ${connectionString.replace(/:[^:@]+@/, ":***@")}`,
      );
      await runMigration(connectionString);
      console.log("Schema applied successfully.");
      return;
    } catch (error) {
      lastError = error;
      console.error(`Connection attempt failed: ${error.message}`);
    }
  }

  console.error(
    "Unable to apply the schema. Use the Supabase session pooler URL from the Connect panel as SUPABASE_SESSION_POOLER_URL.",
  );
  if (lastError) {
    console.error(lastError.message);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
