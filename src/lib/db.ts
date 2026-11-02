import "server-only";
import postgres from "postgres";

// Supabase Postgres. Set DATABASE_URL to the "Transaction pooler" connection string
// (Supabase dashboard → Connect → Transaction pooler, port 6543), with your database password filled in.
const url = process.env.DATABASE_URL;

function connect() {
  if (!url) throw new Error("DATABASE_URL is not set. Add your Supabase connection string to .env.");
  return postgres(url, {
    prepare: false, // required by Supabase's transaction pooler
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    onnotice: () => {},
  });
}

// Reuse one pool per server instance (and across hot reloads in development).
const g = globalThis as unknown as { __mceSql?: postgres.Sql; __mceReady?: Promise<void> };
const pool = () => (g.__mceSql ??= connect());

// Tables live in their own "mce" schema with row-level security on and no policies,
// so Supabase's public REST API cannot read them. Only this server (via DATABASE_URL) can.
const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS mce;

CREATE TABLE IF NOT EXISTS mce.users (
  id             bigserial PRIMARY KEY,
  phone          text NOT NULL UNIQUE,
  name           text NOT NULL,
  company        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  last_logout_at timestamptz,
  login_count    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mce.otp_codes (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL,
  name        text NOT NULL,
  company     text NOT NULL,
  code_hash   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  ip          text
);
CREATE INDEX IF NOT EXISTS otp_phone_idx ON mce.otp_codes (phone, created_at);
CREATE INDEX IF NOT EXISTS otp_ip_idx ON mce.otp_codes (ip, created_at);

CREATE TABLE IF NOT EXISTS mce.sessions (
  id            bigserial PRIMARY KEY,
  token_hash    text NOT NULL UNIQUE,
  user_id       bigint NOT NULL REFERENCES mce.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  logged_out_at timestamptz,
  ip            text,
  user_agent    text
);

-- Every login and logout, with the name, company and phone given at that login.
CREATE TABLE IF NOT EXISTS mce.access_log (
  id         bigserial PRIMARY KEY,
  event      text NOT NULL CHECK (event IN ('login', 'logout')),
  at         timestamptz NOT NULL DEFAULT now(),
  user_id    bigint NOT NULL REFERENCES mce.users(id) ON DELETE CASCADE,
  session_id bigint REFERENCES mce.sessions(id) ON DELETE SET NULL,
  phone      text NOT NULL,
  name       text NOT NULL,
  company    text NOT NULL,
  ip         text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS access_log_at_idx ON mce.access_log (at);
CREATE INDEX IF NOT EXISTS access_log_user_idx ON mce.access_log (user_id, event);

ALTER TABLE mce.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mce.otp_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mce.sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mce.access_log ENABLE ROW LEVEL SECURITY;
`;

/** Returns the connection pool, creating the tables on first use. */
export async function db(): Promise<postgres.Sql> {
  const sql = pool();
  g.__mceReady ??= sql
    .begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(726354)`; // one instance at a time creates tables
      await tx.unsafe(SCHEMA);
    })
    .then(() => undefined)
    .catch(err => {
      g.__mceReady = undefined; // retry on the next request
      throw err;
    });
  await g.__mceReady;
  return sql;
}
