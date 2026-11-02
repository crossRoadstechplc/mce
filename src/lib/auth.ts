import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { db, now } from "./db";

export const SESSION_COOKIE = "mce_session";

const OTP_TTL_MIN = 5; // code valid for 5 minutes
const OTP_MAX_ATTEMPTS = 5; // wrong guesses allowed per code
const OTP_RESEND_SEC = 60; // wait between codes to the same phone
const OTP_MAX_PER_HOUR_PHONE = 5;
const OTP_MAX_PER_HOUR_IP = 20;
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;

const SECRET = process.env.AUTH_SECRET || "";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const hashCode = (phone: string, code: string) => sha256(`${SECRET}:${phone}:${code}`);
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export type Client = { ip: string | null; userAgent: string | null };

export function clientFrom(req: Request): Client {
  const h = req.headers;
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) || null };
}

/* ---------- one-time codes ---------- */

type OtpRow = { id: number; phone: string; name: string; company: string; code_hash: string; expires_at: string; attempts: number };

/** Checks limits and stores a new code. Returns the code to send, or an error message. */
export function createOtp(phone: string, name: string, company: string, c: Client): { code: string } | { error: string; retryAfter?: number } {
  const last = db.prepare("SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1").get(phone) as { created_at: string } | undefined;
  if (last) {
    const wait = OTP_RESEND_SEC - Math.floor((Date.now() - Date.parse(last.created_at)) / 1000);
    if (wait > 0) return { error: `Please wait ${wait} seconds before requesting another code.`, retryAfter: wait };
  }
  const perPhone = db.prepare("SELECT COUNT(*) n FROM otp_codes WHERE phone = ? AND created_at > ?").get(phone, minutesAgo(60)) as { n: number };
  if (perPhone.n >= OTP_MAX_PER_HOUR_PHONE) return { error: "Too many codes requested for this number. Try again in an hour." };
  if (c.ip) {
    const perIp = db.prepare("SELECT COUNT(*) n FROM otp_codes WHERE ip = ? AND created_at > ?").get(c.ip, minutesAgo(60)) as { n: number };
    if (perIp.n >= OTP_MAX_PER_HOUR_IP) return { error: "Too many codes requested. Try again later." };
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  // Only the newest code for a phone is valid.
  db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL").run(now(), phone);
  db.prepare("INSERT INTO otp_codes (phone, name, company, code_hash, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(phone, name, company, hashCode(phone, code), now(), minutesFromNow(OTP_TTL_MIN), c.ip);
  return { code };
}

/** Removes a code that could not be delivered, so the user can retry straight away. */
export function discardOtp(phone: string) {
  db.prepare("DELETE FROM otp_codes WHERE id = (SELECT id FROM otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1)").run(phone);
}

export function verifyOtp(phone: string, code: string): { ok: true; name: string; company: string } | { ok: false; error: string } {
  const row = db.prepare("SELECT * FROM otp_codes WHERE phone = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1").get(phone) as OtpRow | undefined;
  if (!row) return { ok: false, error: "No active code. Request a new one." };
  if (Date.parse(row.expires_at) < Date.now()) return { ok: false, error: "This code has expired. Request a new one." };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong attempts. Request a new code." };

  const a = Buffer.from(hashCode(phone, code)), b = Buffer.from(row.code_hash);
  if (!crypto.timingSafeEqual(a, b)) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return { ok: false, error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Request a new code." };
  }
  db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").run(now(), row.id);
  return { ok: true, name: row.name, company: row.company };
}

/* ---------- sessions and the access log ---------- */

/** Creates the user if new, starts a session and records the login. Returns the cookie token. */
export function startSession(phone: string, name: string, company: string, c: Client) {
  const t = now();
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (phone, name, company, created_at, last_login_at, login_count) VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(phone) DO UPDATE SET name = excluded.name, company = excluded.company,
         last_login_at = excluded.last_login_at, login_count = login_count + 1`
    ).run(phone, name, company, t, t);
    const user = db.prepare("SELECT id FROM users WHERE phone = ?").get(phone) as { id: number };
    const s = db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .run(sha256(token), user.id, t, expires.toISOString(), c.ip, c.userAgent);
    db.prepare("INSERT INTO access_log (event, at, user_id, session_id, phone, name, company, ip, user_agent) VALUES ('login', ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(t, user.id, s.lastInsertRowid, phone, name, company, c.ip, c.userAgent);
  });
  tx();
  return { token, expires };
}

export type SessionUser = { sessionId: number; userId: number; phone: string; name: string; company: string; lastLoginAt: string | null; lastLogoutAt: string | null };

export function findSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.id sessionId, u.id userId, u.phone, u.name, u.company, s.expires_at, s.logged_out_at,
            (SELECT MAX(at) FROM access_log WHERE user_id = u.id AND event = 'login' AND session_id <> s.id) lastLoginAt,
            u.last_logout_at lastLogoutAt
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  ).get(sha256(token)) as (SessionUser & { expires_at: string; logged_out_at: string | null }) | undefined;
  if (!row || row.logged_out_at || Date.parse(row.expires_at) < Date.now()) return null;
  return { sessionId: row.sessionId, userId: row.userId, phone: row.phone, name: row.name, company: row.company, lastLoginAt: row.lastLoginAt, lastLogoutAt: row.lastLogoutAt };
}

/** Ends the session and records the logout. */
export function endSession(token: string | undefined, c: Client) {
  const s = findSession(token);
  if (!s) return;
  const t = now();
  db.transaction(() => {
    db.prepare("UPDATE sessions SET logged_out_at = ? WHERE id = ?").run(t, s.sessionId);
    db.prepare("UPDATE users SET last_logout_at = ? WHERE id = ?").run(t, s.userId);
    db.prepare("INSERT INTO access_log (event, at, user_id, session_id, phone, name, company, ip, user_agent) VALUES ('logout', ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(t, s.userId, s.sessionId, s.phone, s.name, s.company, c.ip, c.userAgent);
  })();
}

/** Current signed-in user for Server Components and route handlers. */
export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // The session check reads the clock and the database, so it must run per request, not at prerender.
  await io();
  return findSession(token);
}
