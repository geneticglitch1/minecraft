import { inspectContainer, containerEnv } from "@/server/docker";
import { listOnlinePlayers } from "@/server/mc";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getWorldSizeBytes } from "@/server/sampler";
import { readWorldInfo } from "@/server/playerstats";
import { readEnvFile } from "@/server/envfile";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

// BlueMap detection (in-network probe of the mc container), cached 60 s.
let mapCheck: { at: number; available: boolean } = { at: 0, available: false };

async function bluemapAvailable(running: boolean): Promise<boolean> {
  if (!running) return false;
  if (Date.now() - mapCheck.at < 60_000) return mapCheck.available;
  let available = false;
  try {
    const res = await fetch(`http://${env.mcContainer}:8100/`, { signal: AbortSignal.timeout(1500) });
    available = res.ok;
  } catch {}
  mapCheck = { at: Date.now(), available };
  return available;
}

export async function GET() {
  return handle(async () => {
    let container;
    let dockerAvailable = true;
    try {
      container = await inspectContainer(env.mcContainer);
    } catch {
      dockerAvailable = false;
      container = { exists: false, running: false, status: "unknown" as const };
    }

    let players: { online: number; max: number; names: string[] } = { online: 0, max: 0, names: [] };
    let version: string | null = null;
    let serverType: string | null = null;
    if (container.running) {
      try {
        players = await listOnlinePlayers();
      } catch {}
      try {
        const cenv = await containerEnv(env.mcContainer);
        version = cenv["VERSION"] ?? null;
        serverType = cenv["TYPE"] ?? null;
      } catch {}
    }

    const latest = db()
      .prepare("SELECT * FROM metrics ORDER BY ts DESC LIMIT 1")
      .get() as Record<string, number | null> | undefined;

    const pendingCount = (
      db().prepare("SELECT COUNT(*) AS n FROM approved_players WHERE status = 'pending'").get() as { n: number }
    ).n;

    return ok({
      dockerAvailable,
      container,
      players,
      version,
      serverType,
      metrics: latest ?? null,
      pendingApprovals: pendingCount,
      map: {
        available: await bluemapAvailable(container.running),
        port: Number(readEnvFile()["MAP_PORT"]) || 8100,
      },
      world: readWorldInfo(getWorldSizeBytes()),
      uptimeMs:
        container.running && "startedAt" in container && container.startedAt
          ? Date.now() - new Date(container.startedAt).getTime()
          : null,
    });
  });
}
