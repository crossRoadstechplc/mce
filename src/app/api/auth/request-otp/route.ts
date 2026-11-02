import { NextResponse } from "next/server";
import { clientFrom, createOtp, discardOtp } from "@/lib/auth";
import { normalizeEthPhone } from "@/lib/phone";
import { sendSms, smsConfigured } from "@/lib/sms";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizeEthPhone(typeof body.phone === "string" ? body.phone : "");
  const name = clean(body.name, 80);
  const company = clean(body.company, 120);

  if (!name || name.length < 2) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
  if (!company || company.length < 2) return NextResponse.json({ error: "Enter your company." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Enter an Ethiopian mobile number, e.g. 0911 234 567." }, { status: 400 });

  const r = await createOtp(phone, name, company, clientFrom(req));
  if ("error" in r) return NextResponse.json({ error: r.error, retryAfter: r.retryAfter }, { status: 429 });

  try {
    await sendSms(phone, `Your MCE Feasibility verification code is ${r.code}. It expires in 5 minutes. Do not share it.`);
  } catch {
    await discardOtp(phone);
    return NextResponse.json({ error: "We could not send the SMS. Please try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, phone, devMode: !smsConfigured() && process.env.NODE_ENV !== "production" });
}
