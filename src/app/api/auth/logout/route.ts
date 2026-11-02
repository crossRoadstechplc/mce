import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, clientFrom, endSession } from "@/lib/auth";

export async function POST(req: Request) {
  const jar = await cookies();
  endSession(jar.get(SESSION_COOKIE)?.value, clientFrom(req));
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
