import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 500);
    const type = req.nextUrl.searchParams.get("type");
    const rows = type
      ? db().prepare("SELECT * FROM activity WHERE type = ? ORDER BY ts DESC LIMIT ?").all(type, limit)
      : db().prepare("SELECT * FROM activity ORDER BY ts DESC LIMIT ?").all(limit);
    return ok(rows);
  });
}
