import { assertDeploymentEditable } from "@/server/managed";
import { withServerOperation } from "@/server/operation";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { readWorldInfo } from "@/server/playerstats";
import { getWorldSizeBytes } from "@/server/sampler";
import { inspectContainer, powerContainer } from "@/server/docker";
import { safetyBackup } from "@/server/backups";
import { logActivity } from "@/server/db";
import { notify } from "@/server/notify";
import { env } from "@/server/env";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(readWorldInfo(getWorldSizeBytes())));
}

/** Danger zone: archive the current world and generate a fresh one. */
export async function POST(req: NextRequest) {
  return handle(() => withServerOperation(async () => {
    assertDeploymentEditable();
    const { op, confirm } = await readJson<{ op?: string; confirm?: string }>(req);
    if (op !== "reset") return fail("Unknown operation");
    if (confirm !== "reset the world") return fail('Type "reset the world" to confirm');

    const worldDir = path.join(env.mcDataDir, "world");
    if (!fs.existsSync(worldDir)) return fail("No world folder found");

    await safetyBackup("world reset");
    const backup = await inspectContainer(env.backupContainer);
    if (backup.running) await powerContainer(env.backupContainer, "stop");
    const state = await inspectContainer(env.mcContainer);
    if (state.running) await powerContainer(env.mcContainer, "stop");

    const archived = `world.old-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.renameSync(worldDir, path.join(env.mcDataDir, archived));

    await powerContainer(env.mcContainer, "start");
    if (backup.running) await powerContainer(env.backupContainer, "start");
    logActivity("world_reset", null, `old world kept as ${archived}`);
    notify("warn", "World reset", `A fresh world is generating. Old world kept as ${archived}.`);
    return ok({ archived });
  }));
}
