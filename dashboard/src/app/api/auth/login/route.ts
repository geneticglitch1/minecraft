import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/passwords";
import { createSessionToken, SESSION_COOKIE, sessionCookieAttributes } from "@/server/session";
import { env } from "@/server/env";
import { fail, readJson, handle } from "@/server/api";

/** Simple in-memory login rate limit: 10 attempts / 15 min per IP. */
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    if (rateLimited(ip)) return fail("Too many attempts — try again in 15 minutes", 429);

    const { username, password } = await readJson<{ username?: string; password?: string }>(req);
    if (!username || !password) return fail("Username and password required");

    const user = db()
      .prepare("SELECT * FROM panel_users WHERE username = ?")
      .get(username.toLowerCase()) as { username: string; pass_hash: string; must_change: number } | undefined;

    if (!user || !verifyPassword(password, user.pass_hash)) {
      return fail("Wrong username or password", 401);
    }

    attempts.delete(ip);
    const token = await createSessionToken(env.sessionSecret, user.username);
    const res = NextResponse.json({ ok: true, data: { mustChange: user.must_change === 1 } });
    res.headers.set("Set-Cookie", `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes()}`);
    return res;
  });
}
