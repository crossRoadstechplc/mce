import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { clientFrom, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Wrong-password limit: 5 tries per 15 minutes per IP (kept in memory).
const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;

const digest = (s: string) => crypto.createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return NextResponse.json({ error: "ADMIN_PASSWORD is not set in .env." }, { status: 503 });

  const ip = clientFrom(req).ip || "unknown";
  const f = fails.get(ip);
  if (f && f.n >= MAX_FAILS && f.until > Date.now()) {
    return NextResponse.json({ error: "Too many wrong attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const given = typeof body.password === "string" ? body.password : "";
  if (!crypto.timingSafeEqual(digest(given), digest(expected))) {
    const n = f && f.until > Date.now() ? f.n + 1 : 1;
    fails.set(ip, { n, until: Date.now() + LOCK_MS });
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  fails.delete(ip);

  const users = db.prepare(
    `SELECT name, company, phone, login_count, created_at, last_login_at, last_logout_at
       FROM users ORDER BY COALESCE(last_login_at, created_at) DESC`
  ).all();
  const events = db.prepare(
    `SELECT at, event, name, company, phone, ip, user_agent FROM access_log ORDER BY id DESC LIMIT 2000`
  ).all();

  return NextResponse.json({ users, events }, { headers: { "Cache-Control": "no-store" } });
}
