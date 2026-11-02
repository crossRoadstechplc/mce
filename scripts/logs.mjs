// Prints users and the login/logout log from the SQLite database.
// Usage: npm run logs            (last 50 events)
//        npm run logs -- 200     (last 200 events)
//        npm run logs -- csv > logs.csv
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
if (!fs.existsSync(file)) { console.log(`No database yet at ${file}`); process.exit(0); }
const db = new Database(file, { readonly: true });
const arg = process.argv[2];
const local = (t) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" }) : "");

if (arg === "csv") {
  const rows = db.prepare("SELECT at, event, name, company, phone, ip, user_agent FROM access_log ORDER BY id").all();
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  console.log(["time_utc", "time_addis", "event", "name", "company", "phone", "ip", "user_agent"].join(","));
  for (const r of rows) console.log([r.at, local(r.at), r.event, r.name, r.company, r.phone, r.ip, r.user_agent].map(q).join(","));
  process.exit(0);
}

console.log("\nUsers (times in Addis Ababa)");
console.table(db.prepare("SELECT name, company, phone, login_count, last_login_at, last_logout_at FROM users ORDER BY last_login_at DESC").all()
  .map((u) => ({ ...u, last_login_at: local(u.last_login_at), last_logout_at: local(u.last_logout_at) })));

const n = Number(arg) || 50;
console.log(`\nLast ${n} logins and logouts`);
console.table(db.prepare("SELECT at, event, name, company, phone, ip FROM access_log ORDER BY id DESC LIMIT ?").all(n)
  .map((r) => ({ ...r, at: local(r.at) })));
