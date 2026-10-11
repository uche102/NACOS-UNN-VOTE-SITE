import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export function createSetupCode() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashSetupCode(code) {
  const pepper = process.env.SETUP_CODE_PEPPER;
  if (!pepper) throw new Error("SETUP_CODE_PEPPER is not configured.");

  return crypto
    .createHmac("sha256", pepper)
    .update(String(code))
    .digest("hex");
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);

  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;

  const [algorithm, saltText, keyText] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !keyText) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");

    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;

    const actual = await scrypt(password, salt, KEY_LENGTH);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
