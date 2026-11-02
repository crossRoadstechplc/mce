import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatEthPhone } from "@/lib/phone";
import LogoutButton from "./logout-button";
import AdminPopup from "./admin-popup";

export default function Home() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const last = user.lastLoginAt ? `Previous login: ${new Date(user.lastLoginAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })}` : "First login";

  return (
    <div className="shell">
      <header className="bar">
        <span className="brand">MCE Real Estate · Feasibility</span>
        <span className="who" title={`${formatEthPhone(user.phone)} · ${last}`}>
          <b>{user.name}</b>
          <span className="co"> · {user.company}</span>
        </span>
        <LogoutButton />
      </header>
      {/* The original app, unchanged, served only to signed-in users. */}
      <iframe className="frame" src="/feasibility" title="MCE Residential Feasibility" />
      <AdminPopup />
    </div>
  );
}
