"use client";

import { useEffect, useRef, useState } from "react";
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

export default function LoginForm() {
  const [step, setStep] = useState<"details" | "code">("details");
  const [phone, setPhone] = useState("");
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
      if (s?.phone) setPhone(s.phone);
    } catch {}
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(""); setBusy(true);
    const { ok, data } = await post("/api/auth/request-otp", { phone });
    setBusy(false);
    if (!ok) {
      setError(data.error || "Something went wrong. Try again.");
      if (data.retryAfter) setWait(data.retryAfter);
      return;
    }
    try { localStorage.setItem(REMEMBER, JSON.stringify({ phone })); } catch {}
    setSentTo(data.phone); setDevMode(!!data.devMode); setCode(""); setWait(60); setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const { ok, data } = await post("/api/auth/verify-otp", { phone: sentTo, code });
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
          <p className="lead" style={{ marginTop: 6 }}>We sent a 6-digit code by SMS to <b>{prettyPhone(sentTo)}</b>.</p>
        </div>
        <div className="sms-hint">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span>Open the <b>Messages</b> app on your phone, find the SMS with your code, and enter it below. The code expires in 5 minutes.</span>
        </div>
        {devMode && <p className="note">Development mode: no SMS key is set, so the code is printed in the server terminal.</p>}
        <form className="form" onSubmit={verify}>
          <input
            ref={codeRef} className="input code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            aria-label="Verification code" aria-invalid={!!error} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn" disabled={busy || code.length !== 6}>{busy ? <><Spinner /> Checking…</> : "Verify and continue"}</button>
          <div className="row">
            <button type="button" className="link" onClick={() => { setStep("details"); setError(""); }}>Change details</button>
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
        <p className="lead" style={{ marginTop: 6 }}>Enter your mobile number. We will send you a 6-digit code by SMS.</p>
      </div>
      <form className="form" onSubmit={requestCode}>
        <div className="field">
          <label htmlFor="phone">Mobile number</label>
          <div className="phone">
            <span className="cc">+251</span>
            <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel-national" autoFocus required placeholder="9X XXX XXXX" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <span className="help">For example 0911 234 567.</span>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" disabled={busy || wait > 0}>{busy ? <><Spinner /> Sending code…</> : wait > 0 ? `Wait ${wait}s` : "Send code"}</button>
      </form>
    </>
  );
}
