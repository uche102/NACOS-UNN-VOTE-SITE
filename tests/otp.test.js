import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

process.env.OTP_PEPPER = "local-test-pepper";

const records = [];
let nextId = 1;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./supabase.js" &&
      context.parentURL?.endsWith("/api/_lib/otp.js")
    ) {
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(`
          export async function supabaseRequest(path, options = {}) {
            if (path !== "otp_codes") throw new Error("Unexpected table");
            const query = options.query || {};
            if (options.method === "PATCH") {
              for (const record of globalThis.__otpRecords) {
                const matches = Object.entries(query).every(([key, value]) => {
                  if (value === "is.null") return record[key] == null;
                  if (value.startsWith("eq.")) return String(record[key]) === value.slice(3);
                  return true;
                });
                if (matches) Object.assign(record, options.body);
              }
              return globalThis.__otpRecords;
            }
            throw new Error("Unexpected database method");
          }

          export async function insertRows(path, rows) {
            if (path !== "otp_codes") throw new Error("Unexpected table");
            const inserted = rows.map(row => ({
              id: globalThis.__otpNextId++,
              attempts: 0,
              used_at: null,
              created_at: new Date(Date.now() + globalThis.__otpNextId).toISOString(),
              ...row
            }));
            globalThis.__otpRecords.push(...inserted);
            return inserted;
          }

          export async function getSingle(path, query) {
            if (path !== "otp_codes") throw new Error("Unexpected table");
            return globalThis.__otpRecords
            .filter((record) =>
  Object.entries(query).every(([key, value]) => {
    if (key === "limit") return true;
    if (value === "is.null") return record[key] == null;
    if (value.startsWith("eq.")) {
      return String(record[key]) === value.slice(3);
    }
    return true;
  }),
)
              .sort((a, b) => b.id - a.id)[0] ?? null;
          }
        `),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

globalThis.__otpRecords = records;
globalThis.__otpNextId = nextId;

const { storeOtp, verifyOtp, createOtpCode } =
  await import("../api/_lib/otp.js");

test.beforeEach(() => {
  records.length = 0;
  nextId = 1;
  globalThis.__otpNextId = nextId;
});

test("OTP codes are six digits", () => {
  for (let i = 0; i < 100; i++) {
    assert.match(createOtpCode(), /^\d{6}$/);
  }
});

test("a correct OTP succeeds and cannot be reused", async () => {
  await storeOtp("TEST-001", "123456");
  assert.deepEqual(await verifyOtp("TEST-001", "123456"), { ok: true });
  assert.deepEqual(await verifyOtp("TEST-001", "123456"), {
    ok: false,
    message: "No active OTP found.",
  });
});

test("an incorrect OTP increments attempts", async () => {
  await storeOtp("TEST-002", "123456");
  assert.deepEqual(await verifyOtp("TEST-002", "000000"), {
    ok: false,
    message: "Invalid OTP.",
  });
  assert.equal(records[0].attempts, 1);
});

test("an expired OTP is rejected and consumed", async () => {
  await storeOtp("TEST-003", "123456");
  records[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual(await verifyOtp("TEST-003", "123456"), {
    ok: false,
    message: "OTP has expired. Request a new code.",
  });
  assert.ok(records[0].used_at);
});

test("five incorrect attempts block verification", async () => {
  await storeOtp("TEST-004", "123456");
  for (let i = 0; i < 5; i++) {
    assert.equal((await verifyOtp("TEST-004", "000000")).ok, false);
  }
  assert.deepEqual(await verifyOtp("TEST-004", "123456"), {
    ok: false,
    message: "Too many OTP attempts.",
  });
});

test("a new OTP invalidates the previous one", async () => {
  await storeOtp("TEST-005", "111111");
  await storeOtp("TEST-005", "222222");
  assert.deepEqual(await verifyOtp("TEST-005", "111111"), {
    ok: false,
    message: "Invalid OTP.",
  });
  assert.deepEqual(await verifyOtp("TEST-005", "222222"), { ok: true });
});
