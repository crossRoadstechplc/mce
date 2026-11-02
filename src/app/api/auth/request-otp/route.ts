import { NextResponse } from "next/server";
import { clientFrom, createOtp, discardOtp } from "@/lib/auth";
import { emailConfigured, normalizeEmail, sendOtpEmail } from "@/lib/email";
import { otpMedium, type Contact } from "@/lib/otp-medium";
import { normalizeEthPhone } from "@/lib/phone";
import { sendSms, smsConfigured } from "@/lib/sms";

const isDev = process.env.NODE_ENV !== "production";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const medium = otpMedium();

  let to: Contact;
  if (medium === "email") {
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    to = { kind: "email", value: email };
  } else {
    const phone = normalizeEthPhone(typeof body.phone === "string" ? body.phone : "");
    if (!phone) return NextResponse.json({ error: "Enter an Ethiopian mobile number, e.g. 0911 234 567." }, { status: 400 });
    to = { kind: "phone", value: phone };
  }

  const r = await createOtp(to, clientFrom(req));
  if ("error" in r) return NextResponse.json({ error: r.error, retryAfter: r.retryAfter }, { status: 429 });

  try {
    if (medium === "email") await sendOtpEmail(to.value, r.code, 5);
    else await sendSms(to.value, `Your MCE Feasibility verification code is ${r.code}. It expires in 5 minutes. Do not share it.`);
  } catch {
    await discardOtp(to);
    const what = medium === "email" ? "email" : "SMS";
    return NextResponse.json({ error: `We could not send the ${what}. Please try again shortly.` }, { status: 502 });
  }

  const devMode = isDev && (medium === "email" ? !emailConfigured() : !smsConfigured());
  return NextResponse.json({ ok: true, medium, to: to.value, devMode });
}
