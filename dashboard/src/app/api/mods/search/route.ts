import { NextRequest } from "next/server";
import { searchMods } from "@/server/modrinth";
import { ok, fail, handle } from "@/server/api";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return fail("Missing query");
    return ok(await searchMods(q));
  });
}
