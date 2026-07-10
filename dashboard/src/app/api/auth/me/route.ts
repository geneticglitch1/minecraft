import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifySessionToken, SESSION_COOKIE } from "@/server/session";
import { env } from "@/server/env";
import { ok, fail, handle } from "@/server/api";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await verifySessionToken(env.sessionSecret, req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return fail("Unauthorized", 401);
    const user = db()
      .prepare("SELECT username, must_change FROM panel_users WHERE username = ?")
      .get(session.u) as { username: string; must_change: number } | undefined;
    if (!user) return fail("Unauthorized", 401);
    return ok({ username: user.username, mustChange: user.must_change === 1 });
  });
}
