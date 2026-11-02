import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { db } from "./db";

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
const ms = (t: Date | string) => new Date(t).getTime();

export type Client = { ip: string | null; userAgent: string | null };

export function clientFrom(req: Request): Client {
  const h = req.headers;
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) || null };
}

/* ---------- one-time codes ---------- */

/** Checks limits and stores a new code. Returns the code to send, or an error message. */
export async function createOtp(phone: string, name: string, company: string, c: Client): Promise<{ code: string } | { error: string; retryAfter?: number }> {
  const sql = await db();
  const [stats] = await sql<{ last: Date | null; per_phone: number; per_ip: number }[]>`
    SELECT
      (SELECT max(created_at) FROM mce.otp_codes WHERE phone = ${phone}) AS last,
      (SELECT count(*)::int FROM mce.otp_codes WHERE phone = ${phone} AND created_at > now() - interval '1 hour') AS per_phone,
      (SELECT count(*)::int FROM mce.otp_codes WHERE ip = ${c.ip} AND created_at > now() - interval '1 hour') AS per_ip`;

  if (stats.last) {
    const wait = OTP_RESEND_SEC - Math.floor((Date.now() - ms(stats.last)) / 1000);
    if (wait > 0) return { error: `Please wait ${wait} seconds before requesting another code.`, retryAfter: wait };
  }
  if (stats.per_phone >= OTP_MAX_PER_HOUR_PHONE) return { error: "Too many codes requested for this number. Try again in an hour." };
  if (c.ip && stats.per_ip >= OTP_MAX_PER_HOUR_IP) return { error: "Too many codes requested. Try again later." };

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await sql.begin(async tx => {
    // Only the newest code for a phone is valid.
    await tx`UPDATE mce.otp_codes SET consumed_at = now() WHERE phone = ${phone} AND consumed_at IS NULL`;
    await tx`INSERT INTO mce.otp_codes (phone, name, company, code_hash, expires_at, ip)
             VALUES (${phone}, ${name}, ${company}, ${hashCode(phone, code)}, now() + ${OTP_TTL_MIN + " minutes"}::interval, ${c.ip})`;
  });
  return { code };
}

/** Removes a code that could not be delivered, so the user can retry straight away. */
export async function discardOtp(phone: string) {
  const sql = await db();
  await sql`DELETE FROM mce.otp_codes WHERE id = (SELECT id FROM mce.otp_codes WHERE phone = ${phone} ORDER BY id DESC LIMIT 1)`;
}

type OtpRow = { id: string; name: string; company: string; code_hash: string; expires_at: Date; attempts: number };

export async function verifyOtp(phone: string, code: string): Promise<{ ok: true; name: string; company: string } | { ok: false; error: string }> {
  const sql = await db();
  const [row] = await sql<OtpRow[]>`
    SELECT id, name, company, code_hash, expires_at, attempts FROM mce.otp_codes
     WHERE phone = ${phone} AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`;
  if (!row) return { ok: false, error: "No active code. Request a new one." };
  if (ms(row.expires_at) < Date.now()) return { ok: false, error: "This code has expired. Request a new one." };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong attempts. Request a new code." };

  const a = Buffer.from(hashCode(phone, code)), b = Buffer.from(row.code_hash);
  if (!crypto.timingSafeEqual(a, b)) {
    await sql`UPDATE mce.otp_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return { ok: false, error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Request a new code." };
  }
  // Mark used only if still unused, so the same code can't start two sessions.
  const used = await sql`UPDATE mce.otp_codes SET consumed_at = now() WHERE id = ${row.id} AND consumed_at IS NULL RETURNING id`;
  if (!used.length) return { ok: false, error: "No active code. Request a new one." };
  return { ok: true, name: row.name, company: row.company };
}

/* ---------- sessions and the access log ---------- */

/** Creates the user if new, starts a session and records the login. Returns the cookie token. */
export async function startSession(phone: string, name: string, company: string, c: Client) {
  const sql = await db();
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await sql.begin(async tx => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO mce.users (phone, name, company, last_login_at, login_count) VALUES (${phone}, ${name}, ${company}, now(), 1)
      ON CONFLICT (phone) DO UPDATE SET name = excluded.name, company = excluded.company,
        last_login_at = excluded.last_login_at, login_count = mce.users.login_count + 1
      RETURNING id`;
    const [s] = await tx<{ id: string }[]>`
      INSERT INTO mce.sessions (token_hash, user_id, expires_at, ip, user_agent)
      VALUES (${sha256(token)}, ${user.id}, ${expires}, ${c.ip}, ${c.userAgent}) RETURNING id`;
    await tx`INSERT INTO mce.access_log (event, user_id, session_id, phone, name, company, ip, user_agent)
             VALUES ('login', ${user.id}, ${s.id}, ${phone}, ${name}, ${company}, ${c.ip}, ${c.userAgent})`;
  });
  return { token, expires };
}

export type SessionUser = { sessionId: string; userId: string; phone: string; name: string; company: string; lastLoginAt: string | null; lastLogoutAt: string | null };

export async function findSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const sql = await db();
  const [row] = await sql<{ session_id: string; user_id: string; phone: string; name: string; company: string; prev_login: Date | null; last_logout: Date | null }[]>`
    SELECT s.id AS session_id, u.id AS user_id, u.phone, u.name, u.company, u.last_logout_at AS last_logout,
           (SELECT max(at) FROM mce.access_log WHERE user_id = u.id AND event = 'login' AND session_id IS DISTINCT FROM s.id) AS prev_login
      FROM mce.sessions s JOIN mce.users u ON u.id = s.user_id
     WHERE s.token_hash = ${sha256(token)} AND s.logged_out_at IS NULL AND s.expires_at > now()`;
  if (!row) return null;
  return {
    sessionId: row.session_id, userId: row.user_id, phone: row.phone, name: row.name, company: row.company,
    lastLoginAt: row.prev_login ? new Date(row.prev_login).toISOString() : null,
    lastLogoutAt: row.last_logout ? new Date(row.last_logout).toISOString() : null,
  };
}

/** Ends the session and records the logout. */
export async function endSession(token: string | undefined, c: Client) {
  const s = await findSession(token);
  if (!s) return;
  const sql = await db();
  await sql.begin(async tx => {
    const ended = await tx`UPDATE mce.sessions SET logged_out_at = now() WHERE id = ${s.sessionId} AND logged_out_at IS NULL RETURNING id`;
    if (!ended.length) return; // already logged out
    await tx`UPDATE mce.users SET last_logout_at = now() WHERE id = ${s.userId}`;
    await tx`INSERT INTO mce.access_log (event, user_id, session_id, phone, name, company, ip, user_agent)
             VALUES ('logout', ${s.userId}, ${s.sessionId}, ${s.phone}, ${s.name}, ${s.company}, ${c.ip}, ${c.userAgent})`;
  });
}

/** Current signed-in user for Server Components and route handlers. */
export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // The session check reads the database, so it must run per request, not at prerender.
  await io();
  return findSession(token);
}
