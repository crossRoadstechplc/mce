"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }
  return (
    <button className="out" type="button" onClick={logout} disabled={busy}>
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
