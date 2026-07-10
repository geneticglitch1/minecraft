import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { validateCron, reloadSchedules, runScheduleAction, type Schedule } from "@/server/scheduler";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

const ACTIONS = ["restart", "backup", "command", "announce"] as const;

export async function GET() {
  return handle(async () => {
    return ok(db().prepare("SELECT * FROM schedules ORDER BY id ASC").all());
  });
}

type Body =
  | { op: "create"; name: string; cron: string; action: Schedule["action"]; payload?: string }
  | { op: "update"; id: number; name?: string; cron?: string; action?: Schedule["action"]; payload?: string }
  | { op: "toggle"; id: number }
  | { op: "delete"; id: number }
  | { op: "run"; id: number };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    switch (body.op) {
      case "create": {
        if (!body.name?.trim()) return fail("Name required");
        if (!validateCron(body.cron)) return fail("Invalid cron expression");
        if (!ACTIONS.includes(body.action)) return fail("Invalid action");
        db()
          .prepare("INSERT INTO schedules(name, cron, action, payload, created_at) VALUES(?, ?, ?, ?, ?)")
          .run(body.name.trim(), body.cron, body.action, body.payload ?? null, Date.now());
        reloadSchedules();
        return ok({ created: true });
      }
      case "update": {
        const row = db().prepare("SELECT * FROM schedules WHERE id = ?").get(body.id) as Schedule | undefined;
        if (!row) return fail("Schedule not found", 404);
        const cronExpr = body.cron ?? row.cron;
        if (!validateCron(cronExpr)) return fail("Invalid cron expression");
        const action = body.action ?? row.action;
        if (!ACTIONS.includes(action)) return fail("Invalid action");
        db()
          .prepare("UPDATE schedules SET name = ?, cron = ?, action = ?, payload = ? WHERE id = ?")
          .run(body.name ?? row.name, cronExpr, action, body.payload ?? row.payload, body.id);
        reloadSchedules();
        return ok({ updated: true });
      }
      case "toggle": {
        db().prepare("UPDATE schedules SET enabled = 1 - enabled WHERE id = ?").run(body.id);
        reloadSchedules();
        return ok({ toggled: true });
      }
      case "delete": {
        db().prepare("DELETE FROM schedules WHERE id = ?").run(body.id);
        reloadSchedules();
        return ok({ deleted: true });
      }
      case "run": {
        const row = db().prepare("SELECT * FROM schedules WHERE id = ?").get(body.id) as Schedule | undefined;
        if (!row) return fail("Schedule not found", 404);
        const result = await runScheduleAction(row.action, row.payload);
        db()
          .prepare("UPDATE schedules SET last_run_at = ?, last_result = ? WHERE id = ?")
          .run(Date.now(), result.slice(0, 1000), row.id);
        return ok({ result });
      }
      default:
        return fail("Unknown operation");
    }
  });
}
