// How one-time codes are delivered: OTP_MEDIUM=email (default) or OTP_MEDIUM=sms.
// Email mode: users sign in with their email address. SMS mode: with their Ethiopian mobile number.
export type OtpMedium = "email" | "sms";

export function otpMedium(): OtpMedium {
  return (process.env.OTP_MEDIUM || "").trim().toLowerCase() === "sms" ? "sms" : "email";
}

/** Who a code is for: the column it is stored in and the normalized value. */
export type Contact = { kind: "phone" | "email"; value: string };
