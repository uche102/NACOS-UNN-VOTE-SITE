import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const votersFolder = path.join(process.cwd(), "..", "voters");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.",
  );
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function extractLevel(filename) {
  const match = filename.match(/(\d{3})LVL/i);
  return match ? match[1] : null;
}

function normalizeHeaders(headers) {
  return headers.map((h) => {
    const lower = h.toLowerCase().trim();
    if (lower.includes("registration") && lower.includes("number"))
      return "reg_no";
    if (lower.includes("full") && lower.includes("name")) return "name";
    if (lower.includes("phone")) return "phone_number";
    if (lower.includes("email")) return "email";
    return h.trim();
  });
}

async function importFromFile(filePath, level) {
  console.log(`\nProcessing: ${path.basename(filePath)} (Level ${level})`);
  const csv = fs.readFileSync(filePath, "utf8");
  const [headers, ...dataRows] = parseCsv(csv);
  const normalizedHeaders = normalizeHeaders(headers);

  const requiredColumns = ["reg_no", "name", "email", "phone_number"];
  for (const column of requiredColumns) {
    if (!normalizedHeaders.includes(column)) {
      console.warn(
        `⚠️  Skipping ${path.basename(filePath)}: Missing column ${column}`,
      );
      return 0;
    }
  }

  const voters = dataRows
    .map((row) =>
      Object.fromEntries(
        normalizedHeaders.map((header, index) => [header, row[index] || ""]),
      ),
    )
    .map((row) => ({
      reg_no: row.reg_no.trim().toUpperCase(),
      name: row.name.trim(),
      phone_number: row.phone_number.trim(),
      email: row.email.trim().toLowerCase(),
      level: level,
    }))
    .filter((row) => row.reg_no && row.name && row.email && row.phone_number);

  let imported = 0;
  for (let index = 0; index < voters.length; index += 500) {
    const batch = voters.slice(index, index + 500);
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/unn_voters?on_conflict=reg_no`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(batch),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Error importing batch: ${error}`);
      process.exit(1);
    }
    imported += batch.length;
  }

  console.log(`✓ Imported ${imported} voters from level ${level}`);
  return imported;
}

async function main() {
  const files = fs.readdirSync(votersFolder).filter((f) => f.endsWith(".csv"));
  const levelFiles = files.filter((f) => /\d{3}LVL/i.test(f));

  if (levelFiles.length === 0) {
    console.error(`❌ No level CSV files found in ${votersFolder}`);
    console.error("Expected files: 200LVL*, 300LVL*, 400LVL*, 500LVL*");
    process.exit(1);
  }

  let totalImported = 0;
  for (const file of levelFiles) {
    const level = extractLevel(file);
    if (level) {
      const count = await importFromFile(path.join(votersFolder, file), level);
      totalImported += count;
    }
  }

  console.log(`\n✓ Successfully imported ${totalImported} total voters`);
}

main().catch((err) => {
  console.error("❌ Import failed:", err.message);
  process.exit(1);
});
