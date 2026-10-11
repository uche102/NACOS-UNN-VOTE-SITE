import "dotenv/config";
import cors from "cors";
import express from "express";

import adminCandidates from "./api/admin/candidates.js";
import adminEmailStatus from "./api/admin/email-status.js";
import adminLogin from "./api/admin/login.js";
import adminPosts from "./api/admin/posts.js";
import adminResetElection from "./api/admin/reset-election.js";
import adminResults from "./api/admin/results.js";
import adminSession from "./api/admin/session.js";
import adminSetupCode from "./api/admin/setup-code.js";
import adminVoters from "./api/admin/voters.js";
import votersVoted from "./api/admin/voters-voted.js";
import election from "./api/election.js";
import me from "./api/me.js";
import passwordLogin from "./api/password-login.js";
import requestOtp from "./api/request-otp.js";
import verifyOtp from "./api/verify-otp.js";
import setupPassword from "./api/setup-password.js";
import vote from "./api/vote.js";

const app = express();
const port = Number(process.env.PORT || 10000);
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

function route(path, handler) {
  app.all(path, (req, res) => handler(req, res));
}

app.get("/health", (_req, res) => res.json({ ok: true }));
route("/api/setup-password", setupPassword);
route("/api/password-login", passwordLogin);
route("/api/request-otp", requestOtp);
route("/api/verify-otp", verifyOtp);
route("/api/me", me);
route("/api/election", election);
route("/api/vote", vote);
route("/api/admin/login", adminLogin);
route("/api/admin/session", adminSession);
route("/api/admin/posts", adminPosts);
route("/api/admin/candidates", adminCandidates);
route("/api/admin/email-status", adminEmailStatus);
route("/api/admin/reset-election", adminResetElection);
route("/api/admin/setup-code", adminSetupCode);
route("/api/admin/voters", adminVoters);
route("/api/admin/voters-voted", votersVoted);
route("/api/admin/results", adminResults);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`NACOS UNN API listening on ${port}`);
});
