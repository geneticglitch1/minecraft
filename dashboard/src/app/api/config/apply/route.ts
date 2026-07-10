import { NextRequest } from "next/server";
import { applyMcConfig, applyBackupConfig } from "@/server/compose";
import { safetyBackup } from "@/server/backups";
import { notify } from "@/server/notify";
import { ok, fail, readJson, handle } from "@/server/api";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { service, backupFirst } = await readJson<{ service?: string; backupFirst?: boolean }>(req);
    if (backupFirst) await safetyBackup("config apply");
    const res = service === "backup" ? await applyBackupConfig() : await applyMcConfig();
    if (!res.ok) {
      notify("error", "Config apply failed", res.output.slice(-800));
      return fail(`compose failed: ${res.output.slice(-400)}`, 500);
    }
    notify("success", "Configuration applied", "Container recreated with the new settings.", { discord: false });
    return ok({ output: res.output.slice(-1000) });
  });
}
