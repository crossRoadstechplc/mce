"use client";

import { useState } from "react";
import { LoadingScreen, Spinner } from "./loader";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Go to the login page anyway; the session cookie is cleared there if the server was reached.
    } finally {
      window.location.replace("/login");
    }
  }
  return (
    <>
      <button className="out" type="button" onClick={logout} disabled={busy} aria-busy={busy}>
        {busy && <Spinner size={12} />}
        {busy ? "Logging out…" : "Log out"}
      </button>
      {busy && <LoadingScreen label="Signing you out…" overlay />}
    </>
  );
}
