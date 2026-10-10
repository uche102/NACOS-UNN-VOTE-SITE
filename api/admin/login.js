import { json, methodNotAllowed, readBody } from "../_lib/http.js";
import { createAdminSession } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  const { password } = await readBody(req);
  if (!process.env.ADMIN_PASSWORD) {
    return json(res, 500, { error: "Admin password is not configured." });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return json(res, 401, { error: "Invalid admin password." });
  }

  const token = createAdminSession(res);
  return json(res, 200, { message: "Admin login successful.", token });
}
