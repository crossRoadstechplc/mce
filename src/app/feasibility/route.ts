import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// The original feasibility app, served exactly as written, to signed-in users only.
// It lives outside /public so it can never be reached without a session.
const FILE = path.join(process.cwd(), "protected", "feasibility.html");

// Kept in memory and reloaded only when the file changes on disk.
let cached: { mtime: number; body: Buffer; etag: string } | null = null;
async function load() {
  const { mtimeMs } = await fs.stat(FILE);
  if (!cached || cached.mtime !== mtimeMs) {
    const body = await fs.readFile(FILE);
    const etag = `"${crypto.createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
    cached = { mtime: mtimeMs, body, etag };
  }
  return cached;
}

export async function GET(req: Request) {
  if (!(await getCurrentUser())) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const { body, etag } = await load();
  const headers = {
    // Browser may keep a copy, but must ask first every time, so the session is always checked
    // and a logged-out user never sees it from cache. Unchanged file -> 304, nothing re-downloaded.
    "Cache-Control": "private, no-cache",
    ETag: etag,
    "X-Frame-Options": "SAMEORIGIN",
  };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(body), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
