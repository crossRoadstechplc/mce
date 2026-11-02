import { NextResponse } from "next/server";
import { clientFrom, createOtp, discardOtp } from "@/lib/auth";
import { normalizeEthPhone } from "@/lib/phone";
import { sendSms, smsConfigured } from "@/lib/sms";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizeEthPhone(typeof body.phone === "string" ? body.phone : "");
  if (!phone) return NextResponse.json({ error: "Enter an Ethiopian mobile number, e.g. 0911 234 567." }, { status: 400 });

  const r = await createOtp(phone, clientFrom(req));
  if ("error" in r) return NextResponse.json({ error: r.error, retryAfter: r.retryAfter }, { status: 429 });

  try {
    await sendSms(phone, `Your MCE Feasibility verification code is ${r.code}. It expires in 5 minutes. Do not share it.`);
  } catch {
    await discardOtp(phone);
    return NextResponse.json({ error: "We could not send the SMS. Please try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, phone, devMode: !smsConfigured() && process.env.NODE_ENV !== "production" });
}
