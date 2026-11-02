// Prints users and the login/logout log from the Supabase database.
// Usage: npm run logs            (last 50 events)
//        npm run logs -- 200     (last 200 events)
//        npm run logs -- csv > logs.csv
import postgres from "postgres";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set in .env"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : "require", onnotice: () => {} });
const arg = process.argv[2];
const local = (t) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" }) : "");

try {
  const [{ ok }] = await sql`SELECT to_regclass('mce.access_log') IS NOT NULL AS ok`;
  if (!ok) { console.log("No tables yet. They are created on the first sign-in."); process.exit(0); }

  if (arg === "csv") {
    const rows = await sql`SELECT at, event, email, phone, ip, user_agent FROM mce.access_log ORDER BY id`;
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    console.log(["time_utc", "time_addis", "event", "email", "phone", "ip", "user_agent"].join(","));
    for (const r of rows) console.log([new Date(r.at).toISOString(), local(r.at), r.event, r.email, r.phone, r.ip, r.user_agent].map(q).join(","));
  } else {
    console.log("\nLeads (times in Addis Ababa)");
    const users = await sql`SELECT email, phone, login_count, last_login_at, last_logout_at FROM mce.users ORDER BY last_login_at DESC NULLS LAST`;
    console.table(users.map((u) => ({ ...u, email: u.email ?? "", phone: u.phone ?? "", last_login_at: local(u.last_login_at), last_logout_at: local(u.last_logout_at) })));
    const n = Number(arg) || 50;
    console.log(`\nLast ${n} logins and logouts`);
    const ev = await sql`SELECT at, event, email, phone, ip FROM mce.access_log ORDER BY id DESC LIMIT ${n}`;
    console.table(ev.map((r) => ({ ...r, email: r.email ?? "", phone: r.phone ?? "", at: local(r.at) })));
  }
} finally {
  await sql.end();
}
