import { NextResponse } from "next/server";
import { SESSION_COOKIE, clientFrom, startSession, verifyOtp } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { otpMedium, type Contact } from "@/lib/otp-medium";
import { normalizeEthPhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  const value = otpMedium() === "email" ? normalizeEmail(body.email) : normalizeEthPhone(typeof body.phone === "string" ? body.phone : "");
  if (!value || code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  const to: Contact = { kind: otpMedium() === "email" ? "email" : "phone", value };

  const v = await verifyOtp(to, code);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 401 });

  const { token, expires } = await startSession(to, clientFrom(req));
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
