"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "./loader";

type User = { name: string; company: string; phone: string; login_count: number; created_at: string; last_login_at: string | null; last_logout_at: string | null };
type Event = { at: string; event: "login" | "logout"; name: string; company: string; phone: string; ip: string | null; user_agent: string | null };

const fmt = (t: string | null) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", dateStyle: "medium", timeStyle: "short" }) : "—");
const phoneFmt = (p: string) => p.replace(/^251(\d{2})(\d{3})(\d{4})$/, "+251 $1 $2 $3");

function download(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Ctrl + Alt + R opens a password-protected view of who has signed in. */
export default function AdminPopup() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<{ users: User[]; events: Event[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"users" | "events">("users");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  // Listen on this page and inside the app frame (same origin), so the shortcut works wherever focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // r or R: physical R key, or the letter itself (Caps Lock, Shift, other layouts).
      const isR = e.code === "KeyR" || e.key?.toLowerCase() === "r";
      if (e.ctrlKey && e.altKey && isR && !e.repeat) { e.preventDefault(); setOpen(o => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const frame = document.querySelector<HTMLIFrameElement>("iframe.frame");
    const attach = () => { try { frame?.contentWindow?.addEventListener("keydown", onKey); } catch {} };
    attach();
    frame?.addEventListener("load", attach);
    return () => {
      window.removeEventListener("keydown", onKey);
      frame?.removeEventListener("load", attach);
      try { frame?.contentWindow?.removeEventListener("keydown", onKey); } catch {}
    };
  }, []);

  useEffect(() => { if (open && !data) setTimeout(() => pwRef.current?.focus(), 0); }, [open, data]);

  const load = useCallback(async (pw: string) => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not load the logs."); setData(null); return; }
      setData(d);
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally { setBusy(false); }
  }, []);

  const lock = () => { setData(null); setPassword(""); setQ(""); setShow(false); };

  const ql = q.trim().toLowerCase();
  const match = useCallback((r: { name: string; company: string; phone: string }) =>
    !ql || r.name.toLowerCase().includes(ql) || r.company.toLowerCase().includes(ql) || r.phone.includes(ql.replace(/\D/g, "") || ql), [ql]);
  const users = useMemo(() => (data?.users ?? []).filter(match), [data, match]);
  const events = useMemo(() => (data?.events ?? []).filter(match), [data, match]);

  if (!open) return null;

  const close = () => setOpen(false);

  if (!data) {
    return (
      <div className="adm-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
        <form className="adm-lock" role="dialog" aria-modal="true" aria-label="Unlock sign-in log" onSubmit={e => { e.preventDefault(); load(password); }}>
          <button type="button" className="adm-x" aria-label="Close" onClick={close}>×</button>
          <div className="adm-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </div>
          <div className="adm-lock-t">
            <h2>Sign-in log</h2>
            <p>Enter the admin password to see who has signed in.</p>
          </div>
          <div className="adm-pwbox" data-invalid={!!error}>
            <input
              id="adm-pw" ref={pwRef} type={show ? "text" : "password"} autoComplete="current-password"
              placeholder="Admin password" aria-label="Admin password" aria-invalid={!!error}
              value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
            />
            <button type="button" className="adm-eye" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}>
              {show ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <button className="adm-unlock" disabled={busy || !password}>{busy ? <><Spinner /> Checking…</> : "Unlock"}</button>
          <div className="adm-hint">Ctrl + Alt + R or Esc to close</div>
        </form>
      </div>
    );
  }

  return (
    <div className="adm-back" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="adm" role="dialog" aria-modal="true" aria-label="Sign-in log">
        <div className="adm-h">
          <b>Sign-in log</b>
          <span className="adm-sub">{data.users.length} people · {data.events.length} events</span>
          <span className="adm-sp" />
          <button className="link" onClick={lock}>Lock</button>
          <button className="adm-x" aria-label="Close" onClick={close}>×</button>
        </div>
        <>
            <div className="adm-ctrl">
              <div className="adm-tabs" role="tablist">
                <button role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")}>People</button>
                <button role="tab" aria-selected={tab === "events"} onClick={() => setTab("events")}>Logins &amp; logouts</button>
              </div>
              <input className="input adm-q" placeholder="Search phone, name or company" value={q} onChange={e => setQ(e.target.value)} />
              <button className="link" disabled={busy} onClick={() => load(password)}>{busy ? <><Spinner size={12} /> Refreshing…</> : "Refresh"}</button>
              <button className="link" onClick={() =>
                tab === "users"
                  ? download("mce-users.csv", users.map(u => ({ name: u.name, company: u.company, phone: phoneFmt(u.phone), logins: u.login_count, first_seen: fmt(u.created_at), last_login: fmt(u.last_login_at), last_logout: fmt(u.last_logout_at) })))
                  : download("mce-access-log.csv", events.map(e => ({ time: fmt(e.at), event: e.event, name: e.name, company: e.company, phone: phoneFmt(e.phone), ip: e.ip, browser: e.user_agent })))
              }>Download CSV</button>
            </div>
            <div className={busy ? "adm-tbl busy" : "adm-tbl"} aria-busy={busy}>
              {tab === "users" ? (
                <table>
                  <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Logins</th><th>Last login</th><th>Last logout</th><th>First seen</th></tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.phone}><td>{u.name || "—"}</td><td>{u.company || "—"}</td><td>{phoneFmt(u.phone)}</td><td className="num">{u.login_count}</td><td>{fmt(u.last_login_at)}</td><td>{fmt(u.last_logout_at)}</td><td>{fmt(u.created_at)}</td></tr>
                    ))}
                    {!users.length && <tr><td colSpan={7} className="adm-empty">No matches</td></tr>}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead><tr><th>Time</th><th>Event</th><th>Name</th><th>Company</th><th>Phone</th><th>IP</th></tr></thead>
                  <tbody>
                    {events.map((e, i) => (
                      <tr key={i}><td>{fmt(e.at)}</td><td><span className={`adm-ev ${e.event}`}>{e.event === "login" ? "Login" : "Logout"}</span></td><td>{e.name || "—"}</td><td>{e.company || "—"}</td><td>{phoneFmt(e.phone)}</td><td title={e.user_agent || ""}>{e.ip || "—"}</td></tr>
                    ))}
                    {!events.length && <tr><td colSpan={6} className="adm-empty">No matches</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
            <div className="adm-foot">Times in Addis Ababa. Press Ctrl + Alt + R or Esc to close.</div>
        </>
      </div>
    </div>
  );
}
