import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { execInContainer, powerContainer, inspectContainer } from "./docker";
import { logActivity } from "./db";
import { notify } from "./notify";
import { env } from "./env";
import { withServerOperation } from "./operation";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

/**
 * Backup management on top of the itzg/mc-backup sidecar (scheduled tars)
 * plus panel-driven ad-hoc backups, restores, and deletion.
 */

const BACKUP_NAME_RE = /^[\w][\w.\-]*\.(tgz|tar\.gz)$/;

export type BackupInfo = { name: string; size: number; mtime: number };

function backupPath(name: string): string {
  if (!BACKUP_NAME_RE.test(name) || name !== path.basename(name)) {
    throw new Error("Invalid backup file name");
  }
  return path.join(env.backupsDir, name);
}

export function listBackups(): BackupInfo[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(env.backupsDir);
  } catch {
    return [];
  }
  return entries
    .filter((n) => BACKUP_NAME_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(env.backupsDir, name));
      return { name, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function triggerBackup(): Promise<string> {
  return withServerOperation(triggerBackupUnlocked);
}

async function triggerBackupUnlocked(): Promise<string> {
  const before = new Set(listBackups().map((b) => b.name));
  const res = await execInContainer(env.backupContainer, ["backup", "now"], 30 * 60 * 1000);
  if (res.exitCode !== 0) {
    notify("error", "Backup failed", res.output.slice(-800));
    throw new Error(`Backup failed: ${res.output.slice(-300)}`);
  }
  // Some sidecar versions acknowledge the request before writing the archive.
  // Wait for a new complete gzip/tar, never treat the request as a finished backup.
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    for (const created of listBackups().filter((b) => !before.has(b.name) && b.size > 0)) {
      try {
        await execFileAsync("python3", [env.restoreHelper, "verify", "--archive", backupPath(created.name)],
          { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 });
        logActivity("backup", null, created.name);
        notify("success", "Backup completed", created.name, { discord: false });
        return created.name;
      } catch { /* Still being written, or invalid: do not report success. */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("No new complete Minecraft backup appeared within 30 minutes");
}

export function restoreBackup(name: string): Promise<void> {
  return withServerOperation(async () => {
    const file = backupPath(name);
    if (!fs.existsSync(file)) throw new Error("Backup file not found");
    await execFileAsync("python3", [env.restoreHelper, "verify", "--archive", file],
      { timeout: 30 * 60 * 1000 });
    const [mc, backup] = await Promise.all([
      inspectContainer(env.mcContainer), inspectContainer(env.backupContainer),
    ]);
    if (backup.running) await powerContainer(env.backupContainer, "stop");
    if (mc.running) await powerContainer(env.mcContainer, "stop");
    // Failure deliberately leaves the writers stopped for inspection.
    const args = [env.restoreHelper, "restore", "--archive", file,
      "--data", env.mcDataDir, "--work", env.restoreWorkDir];
    if (env.managed) args.push("--lock-file", path.join(env.projectDir, "release-lock.json"));
    const result = await execFileAsync("python3", args, { timeout: 30 * 60 * 1000 });
    if (mc.running) await powerContainer(env.mcContainer, "start");
    if (backup.running) await powerContainer(env.backupContainer, "start");
    logActivity("restore", null, `${name}: ${result.stdout.trim()}`);
    notify("success", "Backup restored", "Previous data retained in the restore workspace.");
  });
}

export function deleteBackup(name: string): Promise<void> {
  return withServerOperation(async () => {
    fs.unlinkSync(backupPath(name));
    logActivity("backup_delete", null, name);
  });
}

export function backupsDirSize(): number {
  return listBackups().reduce((sum, b) => sum + b.size, 0);
}

export function getBackupStream(name: string): { stream: fs.ReadStream; size: number } {
  const file = backupPath(name);
  const st = fs.statSync(file);
  return { stream: fs.createReadStream(file), size: st.size };
}

/** Take a safety backup and wait for it, used before risky operations. */
export async function safetyBackup(reason: string): Promise<void> {
  try {
    await triggerBackup();
  } catch (err) {
    notify("error", "Safety backup failed", `${reason} cancelled: ${(err as Error).message}`);
    throw err;
  }
}
