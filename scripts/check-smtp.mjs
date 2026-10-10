import nodemailer from "nodemailer";

const smtpConfig = {
  host: normalizeSmtpHost(process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST),
  port: process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || 587,
  user: process.env.SMTP_USER || process.env.BREVO_SMTP_USER,
  pass: process.env.SMTP_PASS || process.env.BREVO_SMTP_PASS,
  from: process.env.SMTP_FROM || process.env.BREVO_FROM,
};
const missing = Object.entries(smtpConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`Missing SMTP configuration: ${missing.join(", ")}`);
  process.exit(1);
}

const to = process.argv[2] || process.env.SMTP_TEST_TO || smtpConfig.user;

const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: Number(smtpConfig.port),
  secure: String(smtpConfig.port) === "465",
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass,
  },
});

await transporter.verify();

const info = await transporter.sendMail({
  from: smtpConfig.from,
  to,
  subject: "NACOS UNN SMTP test",
  text: "SMTP is configured correctly for the NACOS UNN election site.",
});

console.log(`SMTP verified. Test email sent to ${to}. Message id: ${info.messageId}`);

function normalizeSmtpHost(host) {
  const value = String(host || "").trim();
  if (value === "smtp.brevo.com") return "smtp-relay.brevo.com";
  return value;
}
