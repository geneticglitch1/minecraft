import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { execInContainer, powerContainer, inspectContainer } from "./docker";
import { db, logActivity } from "./db";
import { notify } from "./notify";
import { env } from "./env";

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

export async function triggerBackup(): Promise<string> {
  const before = new Set(listBackups().map((b) => b.name));
  const res = await execInContainer(env.backupContainer, ["backup", "now"], 30 * 60 * 1000);
  if (res.exitCode !== 0) {
    notify("error", "Backup failed", res.output.slice(-800));
    throw new Error(`Backup failed: ${res.output.slice(-300)}`);
  }
  const created = listBackups().find((b) => !before.has(b.name));
  logActivity("backup", null, created?.name ?? "manual backup");
  notify("success", "Backup completed", created ? created.name : "", { discord: false });
  return created?.name ?? "backup completed";
}

export async function restoreBackup(name: string): Promise<void> {
  const file = backupPath(name);
  if (!fs.existsSync(file)) throw new Error("Backup file not found");

  const state = await inspectContainer(env.mcContainer);
  if (state.running) await powerContainer(env.mcContainer, "stop");

  await new Promise<void>((resolve, reject) => {
    execFile(
      "tar",
      ["-xpzf", file, "-C", env.mcDataDir],
      { timeout: 30 * 60 * 1000 },
      (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve())
    );
  });

  await powerContainer(env.mcContainer, "start");
  logActivity("restore", null, name);
  notify("success", "Backup restored", `World restored from ${name}. Server starting.`);
}

export function deleteBackup(name: string): void {
  fs.unlinkSync(backupPath(name));
  logActivity("backup_delete", null, name);
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
    db();
    notify("warn", "Safety backup failed", `Proceeding with ${reason} anyway: ${(err as Error).message}`);
  }
}
