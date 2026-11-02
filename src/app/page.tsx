import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatEthPhone } from "@/lib/phone";
import LogoutButton from "./logout-button";
import AdminPopup from "./admin-popup";
import AppFrame from "./app-frame";
import { LoadingScreen } from "./loader";

export default function Home() {
  return (
    <Suspense fallback={<LoadingScreen label="Checking your session…" />}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const last = user.lastLoginAt ? `Previous login: ${new Date(user.lastLoginAt).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })}` : "First login";

  const contact = user.email || (user.phone ? formatEthPhone(user.phone) : "");

  return (
    <div className="shell">
      <header className="bar">
        <span className="brand">MCE Real Estate · Feasibility</span>
        <span className="who" title={`${contact} · ${last}`}>
          <b>{contact}</b>
        </span>
        <LogoutButton />
      </header>
      {/* The original app, unchanged, served only to signed-in users. */}
      <AppFrame />
      <AdminPopup />
    </div>
  );
}
