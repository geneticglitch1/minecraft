import { NextRequest } from "next/server";
import { readEnvFile, writeEnvFile, EDITABLE_ENV_KEYS } from "@/server/envfile";
import { logActivity } from "@/server/db";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const all = readEnvFile();
    const values: Record<string, string> = {};
    for (const key of EDITABLE_ENV_KEYS) values[key] = all[key] ?? "";
    return ok(values);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { updates } = await readJson<{ updates?: Record<string, string> }>(req);
    if (!updates || typeof updates !== "object") return fail("Missing updates");
    const allowed = new Set<string>(EDITABLE_ENV_KEYS);
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.has(key)) return fail(`Key not editable: ${key}`);
      if (/[\r\n]/.test(value)) return fail(`Invalid value for ${key}`);
      filtered[key] = value;
    }
    writeEnvFile(filtered);
    logActivity("config", null, Object.keys(filtered).join(", "));
    return ok({ updated: Object.keys(filtered), needsApply: true });
  });
}
