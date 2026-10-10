import { json, methodNotAllowed, readBody } from "./_lib/http.js";
import { hasCompletedRecordedBallot } from "./_lib/ballot-status.js";
import { getElectionStatus } from "./_lib/election-status.js";
import {
  createOtpCode,
  maskEmail,
  sendOtpEmail,
  storeOtp,
} from "./_lib/otp.js";
import { getSingle, supabaseRequest } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  let requestedRegNo = "";
  try {
    const { reg_no, regNo } = await readBody(req);
    const regNoValue = String(reg_no || regNo || "")
      .trim()
      .toUpperCase();
    requestedRegNo = regNoValue;
    if (!regNoValue)
      return json(res, 400, { error: "Registration number is required." });

    const status = await getElectionStatus();
    if (!status.votingOpen) {
      return json(res, 403, { error: "Voting is currently closed." });
    }

    const voter = await getSingle("voters", { reg_no: `eq.${regNoValue}` });
    if (!voter)
      return json(res, 404, { error: "Registration number was not found." });
    if (!voter.email)
      return json(res, 400, { error: "No email is attached to this voter." });

    if (await hasCompletedRecordedBallot(voter)) {
      return json(res, 409, { error: "This voter has already voted." });
    }

    const claimedAt = new Date().toISOString();
    await supabaseRequest("voters", {
      method: "PATCH",
      query: {
        reg_no: `eq.${regNoValue}`,
      },
      body: { otp_claimed_at: claimedAt },
    });

    const code = createOtpCode();
    try {
      await storeOtp(voter.reg_no, code);

      if (
        process.env.ALLOW_DEV_OTP === "true" &&
        process.env.NODE_ENV !== "production"
      ) {
        return json(res, 200, {
          message: "OTP generated in local test mode.",
          sentTo: maskEmail(voter.email),
          testMode: true,
          devOtp: code,
        });
      }

      const info = await sendOtpEmail(voter, code);

      return json(res, 200, {
        message: "OTP sent.",
        sentTo: maskEmail(voter.email),
        messageId: info.messageId,
      });
    } catch (error) {
      await supabaseRequest("voters", {
        method: "PATCH",
        query: {
          reg_no: `eq.${regNoValue}`,
          otp_claimed_at: `eq.${claimedAt}`,
        },
        body: { otp_claimed_at: null },
      }).catch(() => {});
      throw error;
    }
  } catch (error) {
    const message = error.message || "Could not send OTP.";
    console.error("Request OTP failed", {
      regNo: requestedRegNo,
      message,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      response: error.response,
    });
    if (message.includes("already been sent to this registration number")) {
      return json(res, 409, {
        code: "PENDING_OTP",
        error: message,
        regNo: requestedRegNo,
        sentTo: "your registered email",
      });
    }
    if (process.env.EMERGENCY_OTP) {
      return json(res, 200, {
        message:
          "Use the emergency OTP provided by the election administrator.",
        sentTo: "emergency OTP",
        emergency: true,
      });
    }
    if (
      error.code === "EAUTH" ||
      error.responseCode === 535 ||
      message.toLowerCase().includes("authentication failed")
    ) {
      return json(res, 500, {
        code: "EMAIL_AUTH_FAILED",
        error:
          "Brevo rejected the email login. Use BREVO_API_KEY + BREVO_FROM, or set SMTP_USER to your Brevo SMTP login and SMTP_PASS to your Brevo SMTP key.",
      });
    }
    if (
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNECTION" ||
      error.code === "EDNS" ||
      message.toLowerCase().includes("timeout")
    ) {
      return json(res, 500, {
        code: "EMAIL_CONNECTION_FAILED",
        error:
          "Could not connect to Brevo SMTP from Render. Set BREVO_API_KEY and BREVO_FROM to use Brevo's HTTPS email API instead of SMTP.",
      });
    }
    return json(res, 500, { error: message });
  }
}
