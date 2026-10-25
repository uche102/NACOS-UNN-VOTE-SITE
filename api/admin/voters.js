import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { requireAdmin } from "../_lib/session.js";
import { insertRows, supabaseRequest } from "../_lib/supabase.js";

const VALID_LEVELS = new Set(["100L", "200L", "300L", "400L", "500L"]);

function normalizeRegNo(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateVoter({ reg_no, name, email, level }) {
  if (!reg_no || !name || !email || !level) {
    return "Voter ID, full name, email, and level are required.";
  }
  if (reg_no.length > 80 || name.length > 120) {
    return "Voter ID or name is too long.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return "Enter a valid email address.";
  }
  if (!VALID_LEVELS.has(level)) {
    return "Select a valid academic level.";
  }
  return "";
}

async function getAllVoterIdentifiers() {
  const pageSize = 1000;
  const identifiers = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest("voters", {
      query: {
        select: "reg_no,email",
        order: "reg_no.asc",
        limit: String(pageSize),
        offset: String(offset),
      },
    });
    identifiers.push(...page);
    if (page.length < pageSize) return identifiers;
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      const voters = await supabaseRequest("voters", {
        query: {
          select: "reg_no,name,email,level,created_at",
          order: "created_at.desc",
        },
      });
      return json(res, 200, { voters });
    }

    if (req.method !== "POST") return methodNotAllowed(res);

    const body = await readBody(req);
    if (Array.isArray(body.voters)) {
      if (!body.voters.length) {
        return json(res, 400, { error: "Add at least one voter to import." });
      }
      if (body.voters.length > 500) {
        return json(res, 400, { error: "Import no more than 500 voters at a time." });
      }

      const existingVoters = await getAllVoterIdentifiers();
      const existingRegNos = new Set(
        existingVoters.map((voter) => normalizeRegNo(voter.reg_no)),
      );
      const existingEmails = new Set(
        existingVoters.map((voter) => normalizeEmail(voter.email)),
      );
      const importedRegNos = new Set();
      const importedEmails = new Set();
      const rowsToInsert = [];
      const errors = [];

      body.voters.forEach((row, index) => {
        const rowNumber =
          Number.isInteger(row?.row) && row.row >= 2 ? row.row : index + 2;
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          errors.push({ row: rowNumber, message: "Voter row is invalid." });
          return;
        }
        if (
          typeof row.reg_no !== "string" ||
          typeof row.name !== "string" ||
          typeof row.email !== "string" ||
          typeof row.level !== "string"
        ) {
          errors.push({
            row: rowNumber,
            message: "Registration Number, Full Name, Email, and Level must contain text.",
          });
          return;
        }

        const voter = {
          reg_no: normalizeRegNo(row.reg_no),
          name: typeof row.name === "string" ? row.name.trim() : "",
          email: normalizeEmail(row.email),
          level: String(row.level || "").trim().toUpperCase(),
        };
        const validationError = validateVoter(voter);
        if (validationError) {
          errors.push({ row: rowNumber, message: validationError });
          return;
        }

        let rowIsValid = true;
        if (voter.reg_no.startsWith("DEMO ONLY -")) {
          errors.push({
            row: rowNumber,
            message: "Remove the demonstration example row before importing.",
          });
          rowIsValid = false;
        }
        if (existingRegNos.has(voter.reg_no)) {
          errors.push({
            row: rowNumber,
            message: `Voter ID ${voter.reg_no} is already registered.`,
          });
          rowIsValid = false;
        } else if (importedRegNos.has(voter.reg_no)) {
          errors.push({
            row: rowNumber,
            message: `Voter ID ${voter.reg_no} appears more than once in this workbook.`,
          });
          rowIsValid = false;
        }
        if (existingEmails.has(voter.email)) {
          errors.push({
            row: rowNumber,
            message: `Email ${voter.email} is already registered.`,
          });
          rowIsValid = false;
        } else if (importedEmails.has(voter.email)) {
          errors.push({
            row: rowNumber,
            message: `Email ${voter.email} appears more than once in this workbook.`,
          });
          rowIsValid = false;
        }

        importedRegNos.add(voter.reg_no);
        importedEmails.add(voter.email);
        if (rowIsValid) rowsToInsert.push(voter);
      });

      if (errors.length) {
        return json(res, 400, {
          error: "No voters were imported. Correct the listed rows and try again.",
          errors,
        });
      }

      const voters = await insertRows("voters", rowsToInsert);
      return json(res, 201, { imported: voters.length });
    }

    const regNo = normalizeRegNo(body.reg_no);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const level = String(body.level || "").trim().toUpperCase();
    const validationError = validateVoter({
      reg_no: regNo,
      name,
      email,
      level,
    });
    if (validationError) {
      return json(res, 400, { error: validationError });
    }

    const existing = await supabaseRequest("voters", {
      query: { select: "reg_no", reg_no: `eq.${regNo}`, limit: "1" },
    });

    if (existing.length) {
      return json(res, 409, { error: "That voter ID is already registered." });
    }

    const [voter] = await insertRows("voters", [
      { reg_no: regNo, name, email, level },
    ]);

    return json(res, 201, {
      voter: {
        reg_no: voter.reg_no,
        name: voter.name,
        email: voter.email,
        level: voter.level,
        created_at: voter.created_at,
      },
    });
  } catch (error) {
    if (String(error.message || "").includes("duplicate key")) {
      return json(res, 409, { error: "That voter ID is already registered." });
    }

    console.error("Admin voter request failed:", error.message);
    return json(res, 500, { error: "Could not process voter registration." });
  }
}
