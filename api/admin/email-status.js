import { json, methodNotAllowed } from "../_lib/http.js";
import { getEmailConfigStatus } from "../_lib/otp.js";
import { requireAdmin } from "../_lib/session.js";

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "GET") return methodNotAllowed(res);

  return json(res, 200, getEmailConfigStatus());
}
