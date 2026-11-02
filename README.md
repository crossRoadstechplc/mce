# MCE Residential Feasibility — with phone sign-in

The feasibility app (`protected/feasibility.html`) is the original file from `../reference/`, byte-for-byte unchanged.
This Next.js app puts an SMS one-time-code sign-in in front of it and logs every login and logout to a Supabase (Postgres) database.

## Flow
1. Visitor opens `/` → sent to `/login`.
2. Enters full name, company and an Ethiopian mobile number (09… or 07…, any of `0911234567`, `911234567`, `+251911234567`).
3. A 6-digit code is sent by GeezSMS (valid 5 min, 5 wrong tries max, 60 s between resends, 5 codes/hour per number).
4. Correct code → session starts (cookie, `SESSION_DAYS`, default 7) and a `login` row is logged.
5. The app opens below a slim bar showing the user and a **Log out** button. Logging out ends the session and logs a `logout` row.

## Setup
```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL, GEEZSMS_API_KEY, AUTH_SECRET, ADMIN_PASSWORD
npm run dev            # http://localhost:3000
```
Settings are read from `.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEEZSMS_API_KEY` | yes (production) | GeezSMS API key. Without it, dev mode prints codes in the terminal. |
| `GEEZSMS_SENDER_ID` | no | Approved sender name; leave blank for the default. |
| `AUTH_SECRET` | yes | Long random string used to hash codes. |
| `ADMIN_PASSWORD` | for the log popup | Password for the Ctrl + Alt + R sign-in log. |
| `SESSION_DAYS` | no | Session length in days (default 7). |
| `DATABASE_URL` | yes | Supabase **Transaction pooler** connection string (Connect → Transaction pooler, port 6543) with your DB password. |

Production: `npm run build && npm start`, or deploy to Vercel and add the same variables under Project → Settings → Environment Variables. Run behind HTTPS (the session cookie is `Secure` in production).

## Logs
On the main page press **Ctrl + Alt + R**, enter `ADMIN_PASSWORD`, and see everyone who signed in (search, CSV download).

Stored in Supabase, in the private `mce` schema (created automatically on first use; row-level security is on, so Supabase's public API can't read it):
- `users`: one row per phone with name, company, `last_login_at`, `last_logout_at`, `login_count`
- `access_log`: every `login` / `logout` with time, name, company, phone, IP, browser
- `sessions`, `otp_codes`: internal

```bash
npm run logs              # users + last 50 events
npm run logs -- 200       # last 200 events
npm run logs -- csv > logs.csv
```

## Files
- `src/lib/sms.ts`: GeezSMS call (`POST https://api.geezsms.com/api/v1/sms/send`)
- `src/lib/auth.ts`: codes, sessions, login/logout logging
- `src/lib/db.ts`: database connection and schema
- `src/app/login/`: sign-in screens
- `src/app/page.tsx`: signed-in shell with Log out
- `src/app/feasibility/route.ts`: serves the original HTML to signed-in users only
