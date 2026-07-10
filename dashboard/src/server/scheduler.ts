import cron, { type ScheduledTask } from "node-cron";
import { db } from "./db";
import { notify } from "./notify";
import { powerContainer, execInContainer } from "./docker";
import { rcon } from "./rcon";
import { say } from "./mc";
import { env } from "./env";

/**
 * Scheduled tasks (cron-based): restarts, backups, announcements, arbitrary
 * console commands. Definitions live in the panel DB; jobs are (re)loaded
 * whenever they change.
 */

export type Schedule = {
  id: number;
  name: string;
  cron: string;
  action: "restart" | "backup" | "command" | "announce";
  payload: string | null;
  enabled: number;
  last_run_at: number | null;
  last_result: string | null;
};

const g = globalThis as unknown as { __craftdeckJobs?: Map<number, ScheduledTask> };

function jobs(): Map<number, ScheduledTask> {
  if (!g.__craftdeckJobs) g.__craftdeckJobs = new Map();
  return g.__craftdeckJobs;
}

export function validateCron(expr: string): boolean {
  return cron.validate(expr);
}

export async function runScheduleAction(action: Schedule["action"], payload: string | null): Promise<string> {
  switch (action) {
    case "restart": {
      try {
        await say("Server restarting in 30 seconds!");
        await new Promise((r) => setTimeout(r, 30_000));
      } catch {
        // server not reachable over RCON — restart anyway
      }
      await powerContainer(env.mcContainer, "restart");
      return "Restarted";
    }
    case "backup": {
      const res = await execInContainer(env.backupContainer, ["backup", "now"]);
      if (res.exitCode !== 0) throw new Error(res.output.slice(-500) || "backup failed");
      return "Backup completed";
    }
    case "command": {
      if (!payload) throw new Error("No command configured");
      return (await rcon().exec(payload)).slice(0, 500);
    }
    case "announce": {
      if (!payload) throw new Error("No message configured");
      await say(payload);
      return "Announced";
    }
  }
}

async function execute(schedule: Schedule) {
  let result: string;
  try {
    result = await runScheduleAction(schedule.action, schedule.payload);
    if (schedule.action !== "announce") {
      notify("success", `Schedule "${schedule.name}" ran`, result, { discord: false });
    }
  } catch (err) {
    result = `ERROR: ${(err as Error).message}`;
    notify("error", `Schedule "${schedule.name}" failed`, (err as Error).message);
  }
  db()
    .prepare("UPDATE schedules SET last_run_at = ?, last_result = ? WHERE id = ?")
    .run(Date.now(), result.slice(0, 1000), schedule.id);
}

export function reloadSchedules() {
  for (const task of jobs().values()) task.stop();
  jobs().clear();
  const rows = db().prepare("SELECT * FROM schedules WHERE enabled = 1").all() as unknown as Schedule[];
  for (const row of rows) {
    if (!cron.validate(row.cron)) continue;
    jobs().set(
      row.id,
      cron.schedule(row.cron, () => void execute(row))
    );
  }
}

export function startScheduler() {
  reloadSchedules();
}
