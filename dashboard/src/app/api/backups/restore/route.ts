import { NextRequest } from "next/server";
import { restoreBackup } from "@/server/backups";
import { ok, fail, readJson, handle } from "@/server/api";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { name, confirm } = await readJson<{ name?: string; confirm?: string }>(req);
    if (!name) return fail("Missing backup name");
    if (confirm !== "restore") return fail('Type "restore" to confirm');
    await restoreBackup(name);
    return ok({ restored: name });
  });
}
