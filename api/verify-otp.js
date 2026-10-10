import { json, methodNotAllowed, readBody } from "./_lib/http.js";
import { hasCompletedRecordedBallot } from "./_lib/ballot-status.js";
import { verifyOtp } from "./_lib/otp.js";
import { createVoterSession } from "./_lib/session.js";
import { getSingle, supabaseRequest } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const { reg_no, regNo, otp } = await readBody(req);

    const regNoValue = String(reg_no || regNo || "")
      .trim()
      .toUpperCase();
    const otpValue = String(otp || "").trim();

    if (!regNoValue || !otpValue) {
      return json(res, 400, {
        error: "Registration number and OTP are required.",
      });
    }

    const emergencyOtp = process.env.EMERGENCY_OTP;

    if (emergencyOtp && otpValue === emergencyOtp) {
      const voter = await getSingle("voters", { reg_no: `eq.${regNoValue}` });

      if (!voter) {
        return json(res, 404, { error: "Voter not found." });
      }

      if (await hasCompletedRecordedBallot(voter)) {
        return json(res, 409, { error: "This voter has already voted." });
      }

      const token = createVoterSession(res, voter);

      await supabaseRequest("voters", {
        method: "PATCH",
        query: { reg_no: `eq.${regNoValue}` },
        body: {
          otp_verified_at: new Date().toISOString(),
          ballot_submitted_at: null,
        },
      }).catch(() => {});

      return json(res, 200, {
        message: "OTP verified.",
        voter: {
          reg_no: voter.reg_no,
          name: voter.name,
          level: voter.level,
        },
        token,
      });
    }

    const result = await verifyOtp(regNoValue, otpValue);
    if (!result.ok) return json(res, 400, { error: result.message });

    const voter = await getSingle("voters", { reg_no: `eq.${regNoValue}` });
    if (!voter) return json(res, 404, { error: "Voter not found." });

    if (await hasCompletedRecordedBallot(voter)) {
      return json(res, 409, { error: "This voter has already voted." });
    }

    const token = createVoterSession(res, voter);
    await supabaseRequest("voters", {
      method: "PATCH",
      query: { reg_no: `eq.${regNoValue}` },
      body: {
        otp_verified_at: new Date().toISOString(),
        ballot_submitted_at: null,
      },
    }).catch(() => {});
    return json(res, 200, {
      voter: {
        reg_no: voter.reg_no,
        name: voter.name,
        level: voter.level,
      },
      token,
    });
  } catch (error) {
    return json(res, 500, {
      error: error.message || "OTP verification failed.",
    });
  }
}
