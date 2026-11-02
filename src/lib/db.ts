import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// One SQLite file holds users, one-time codes, sessions and the login/logout log.
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  phone          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  company        TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  last_login_at  TEXT,
  last_logout_at TEXT,
  login_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL,
  name        TEXT NOT NULL,
  company     TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_otp_ip ON otp_codes(ip, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  logged_out_at TEXT,
  ip            TEXT,
  user_agent    TEXT
);

-- Every login and logout, with the name, company and phone given at that login.
CREATE TABLE IF NOT EXISTS access_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event      TEXT NOT NULL CHECK (event IN ('login', 'logout')),
  at         TEXT NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER REFERENCES sessions(id),
  phone      TEXT NOT NULL,
  name       TEXT NOT NULL,
  company    TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_at ON access_log(at);
`;

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// Reuse one connection across hot reloads in development.
const g = globalThis as unknown as { __mceDb?: Database.Database };
export const db = g.__mceDb ?? (g.__mceDb = open());

export const now = () => new Date().toISOString();
