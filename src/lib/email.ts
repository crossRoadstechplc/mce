import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// SMTP settings from .env:
//   SMTP_HOST, SMTP_PORT (587 or 465), SMTP_SECURE ("true" for port 465), SMTP_USER, SMTP_PASS, SMTP_FROM
export function emailConfigured() {
  return !!process.env.SMTP_HOST;
}

const g = globalThis as unknown as { __mceMailer?: Transporter };

function transporter() {
  if (g.__mceMailer) return g.__mceMailer;
  const port = Number(process.env.SMTP_PORT) || 587;
  g.__mceMailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return g.__mceMailer;
}

export async function sendOtpEmail(to: string, code: string, ttlMin: number): Promise<void> {
  const subject = `${code} is your MCE Feasibility sign-in code`;
  const text = `Your MCE Feasibility verification code is ${code}.\n\nIt expires in ${ttlMin} minutes. If you did not try to sign in, you can ignore this email.`;

  if (!emailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured");
    // Development without SMTP settings: show the email in the server terminal instead.
    console.log(`\n[dev email] to ${to}: ${text}\n`);
    return;
  }

  const html = `<!doctype html><html><body style="margin:0;background:#F3F8FD;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1D2A3A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #D5DCE4;border-radius:16px">
      <tr><td style="padding:28px 28px 8px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6A7889">MCE Real Estate · Feasibility</td></tr>
      <tr><td style="padding:0 28px;font-size:20px;font-weight:800">Your sign-in code</td></tr>
      <tr><td style="padding:18px 28px"><div style="font-size:34px;font-weight:800;letter-spacing:.3em;background:#E4EFFA;border-radius:12px;padding:14px 0;text-align:center">${code}</div></td></tr>
      <tr><td style="padding:0 28px 28px;font-size:14px;line-height:1.5;color:#6A7889">Enter this code on the sign-in screen. It expires in ${ttlMin} minutes.<br>If you did not try to sign in, you can ignore this email.</td></tr>
    </table>
  </td></tr></table></body></html>`;

  try {
    await transporter().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  } catch (err) {
    console.error(`[email] send failed: ${err instanceof Error ? err.message : err}`);
    throw new Error("Email could not be sent");
  }
}

// Basic shape check; the code email itself proves the address works.
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}
