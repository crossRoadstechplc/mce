import "server-only";

// GeezSMS: https://geezsms.com  (API key from the GeezSMS dashboard)
// Set GEEZSMS_API_KEY in .env.local. Optional: GEEZSMS_SENDER_ID.
const ENDPOINT = process.env.GEEZSMS_ENDPOINT || "https://api.geezsms.com/api/v1/sms/send";

export function smsConfigured() {
  return !!process.env.GEEZSMS_API_KEY;
}

export async function sendSms(phone: string, msg: string): Promise<void> {
  const key = process.env.GEEZSMS_API_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("SMS is not configured");
    // Development without a key: show the message in the server terminal instead.
    console.log(`\n[dev sms] to ${phone}: ${msg}\n`);
    return;
  }

  const body: Record<string, string> = { token: key, phone, msg };
  if (process.env.GEEZSMS_SENDER_ID) body.sender_id = process.env.GEEZSMS_SENDER_ID;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-GeezSMS-Key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let data: { error?: unknown } | null = null;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok || (data && data.error && data.error !== false)) {
    console.error(`[geezsms] send failed (${res.status}): ${text.slice(0, 500)}`);
    throw new Error("SMS provider rejected the message");
  }
}
