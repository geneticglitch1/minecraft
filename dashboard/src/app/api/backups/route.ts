import { listBackups, triggerBackup, backupsDirSize } from "@/server/backups";
import { readEnvFile } from "@/server/envfile";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const envValues = readEnvFile();
    return ok({
      backups: listBackups(),
      totalSize: backupsDirSize(),
      interval: envValues["BACKUP_INTERVAL"] ?? "24h",
      retentionDays: envValues["BACKUP_RETENTION_DAYS"] ?? "7",
    });
  });
}

export async function POST() {
  return handle(async () => {
    const name = await triggerBackup();
    return ok({ created: name });
  });
}
