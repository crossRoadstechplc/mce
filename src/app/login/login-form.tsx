"use client";

import { useEffect, useRef, useState } from "react";
import type { OtpMedium } from "@/lib/otp-medium";
import { LoadingScreen, Spinner } from "../loader";

const REMEMBER = "mce-gate-details";

async function post(url: string, body: unknown) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "No connection. Check your internet and try again." } };
  }
}

const prettyPhone = (p: string) => p.replace(/^251(\d{2})(\d{3})(\d{4})$/, "+251 $1 $2 $3");

const MessageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);
const MailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
);

/** Two steps: contact (email or phone, per OTP_MEDIUM) → 6-digit code. */
export default function LoginForm({ medium }: { medium: OtpMedium }) {
  const isEmail = medium === "email";
  const field = isEmail ? "email" : "phone";

  const [step, setStep] = useState<"details" | "code">("details");
  const [contact, setContact] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [wait, setWait] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // If an expired session lands the login page inside the app frame, take over the whole window.
    if (window.top && window.top !== window.self) window.top.location.href = "/login";
    try {
      const s = JSON.parse(localStorage.getItem(REMEMBER) || "null");
      // Prefill from the last sign-in on this device (browser-only, so it must run after mount).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s?.[field]) setContact(s[field]);
    } catch {}
  }, [field]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(""); setBusy(true);
    const { ok, data } = await post("/api/auth/request-otp", { [field]: contact });
    setBusy(false);
    if (!ok) {
      setError(data.error || "Something went wrong. Try again.");
      if (data.retryAfter) setWait(data.retryAfter);
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem(REMEMBER) || "{}");
      localStorage.setItem(REMEMBER, JSON.stringify({ ...s, [field]: contact }));
    } catch {}
    setSentTo(data.to); setDevMode(!!data.devMode); setCode(""); setWait(60); setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const { ok, data } = await post("/api/auth/verify-otp", { [field]: sentTo, code });
    if (!ok) { setBusy(false); setError(data.error || "Something went wrong. Try again."); return; }
    setSigningIn(true);
    window.location.replace("/");
  }

  if (signingIn) return <LoadingScreen label="Signing you in…" overlay />;

  if (step === "code") {
    return (
      <>
        <div>
          <h1>Enter your code</h1>
          <p className="lead" style={{ marginTop: 6 }}>
            We sent a 6-digit code by {isEmail ? "email" : "SMS"} to <b className="sent-to">{isEmail ? sentTo : prettyPhone(sentTo)}</b>.
          </p>
        </div>
        <div className="sms-hint">
          {isEmail ? <MailIcon /> : <MessageIcon />}
          {isEmail ? (
            <span>Open your <b>email inbox</b>, find the message from MCE Feasibility with your code, and enter it below. Check your spam or junk folder if it hasn&apos;t arrived. The code expires in 5 minutes.</span>
          ) : (
            <span>Open the <b>Messages</b> app on your phone, find the SMS with your code, and enter it below. The code expires in 5 minutes.</span>
          )}
        </div>
        {devMode && <p className="note">Development mode: no {isEmail ? "SMTP settings are" : "SMS key is"} set, so the code is printed in the server terminal.</p>}
        <form className="form" onSubmit={verify}>
          <input
            ref={codeRef} className="input code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            aria-label="Verification code" aria-invalid={!!error} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn" disabled={busy || code.length !== 6}>{busy ? <><Spinner /> Checking…</> : "Verify and continue"}</button>
          <div className="row">
            <button type="button" className="link" onClick={() => { setStep("details"); setError(""); }}>
              {isEmail ? "Change email" : "Change number"}
            </button>
            <button type="button" className="link" disabled={busy || wait > 0} onClick={() => requestCode()}>
              {busy ? "Sending…" : wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <div>
        <h1>Sign in</h1>
        <p className="lead" style={{ marginTop: 6 }}>
          {isEmail ? "Enter your email address. We will email you a 6-digit code." : "Enter your mobile number. We will send you a 6-digit code by SMS."}
        </p>
      </div>
      <form className="form" onSubmit={requestCode}>
        {isEmail ? (
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" className="input" type="email" inputMode="email" autoComplete="email" autoFocus required maxLength={254}
              placeholder="name@company.com" value={contact} onChange={e => setContact(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="phone">Mobile number</label>
            <div className="phone">
              <span className="cc">+251</span>
              <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel-national" autoFocus required
                placeholder="9X XXX XXXX" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
            <span className="help">For example 0911 234 567.</span>
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" disabled={busy || wait > 0}>{busy ? <><Spinner /> Sending code…</> : wait > 0 ? `Wait ${wait}s` : "Send code"}</button>
      </form>
    </>
  );
}
