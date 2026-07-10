import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/passwords";
import { verifySessionToken, SESSION_COOKIE } from "@/server/session";
import { env } from "@/server/env";
import { ok, fail, readJson, handle } from "@/server/api";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await verifySessionToken(env.sessionSecret, req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return fail("Unauthorized", 401);

    const { current, next } = await readJson<{ current?: string; next?: string }>(req);
    if (!current || !next) return fail("Current and new password required");
    if (next.length < 8) return fail("New password must be at least 8 characters");

    const user = db()
      .prepare("SELECT pass_hash FROM panel_users WHERE username = ?")
      .get(session.u) as { pass_hash: string } | undefined;
    if (!user || !verifyPassword(current, user.pass_hash)) {
      return fail("Current password is wrong", 401);
    }
    db()
      .prepare("UPDATE panel_users SET pass_hash = ?, must_change = 0 WHERE username = ?")
      .run(hashPassword(next), session.u);
    return ok({ changed: true });
  });
}
