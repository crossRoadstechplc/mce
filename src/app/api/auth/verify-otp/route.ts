import { NextResponse } from "next/server";
import { SESSION_COOKIE, clientFrom, startSession, verifyOtp } from "@/lib/auth";
import { normalizeEthPhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizeEthPhone(typeof body.phone === "string" ? body.phone : "");
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!phone || code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const v = await verifyOtp(phone, code);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 401 });

  const { token, expires } = await startSession(phone, v.name, v.company, clientFrom(req));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return res;
}
