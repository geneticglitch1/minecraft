import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
    const rows = db().prepare("SELECT * FROM notifications ORDER BY ts DESC LIMIT ?").all(limit);
    const unread = (db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE read = 0").get() as { n: number }).n;
    return ok({ notifications: rows, unread });
  });
}

type Body = { op: "read"; id: number } | { op: "read-all" } | { op: "clear" };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    switch (body.op) {
      case "read":
        db().prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(body.id);
        return ok({});
      case "read-all":
        db().prepare("UPDATE notifications SET read = 1").run();
        return ok({});
      case "clear":
        db().prepare("DELETE FROM notifications").run();
        return ok({});
      default:
        return fail("Unknown operation");
    }
  });
}
