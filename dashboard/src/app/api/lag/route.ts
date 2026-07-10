import { db } from "@/server/db";
import { sparkPings, listOnlinePlayers } from "@/server/mc";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * Lag diagnostics: separates "the server is lagging" (low TPS / high MSPT /
 * high CPU) from "a player's connection is lagging" (high ping) and renders
 * a verdict the admin can read at a glance.
 */
export async function GET() {
  return handle(async () => {
    const recent = db()
      .prepare("SELECT tps, mspt, cpu FROM metrics WHERE ts > ? ORDER BY ts DESC LIMIT 18")
      .all(Date.now() - 3 * 60 * 1000) as Array<{ tps: number | null; mspt: number | null; cpu: number | null }>;

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const tps = avg(recent.map((r) => r.tps).filter((v): v is number => v !== null));
    const mspt = avg(recent.map((r) => r.mspt).filter((v): v is number => v !== null));
    const cpu = avg(recent.map((r) => r.cpu).filter((v): v is number => v !== null));

    let livePings: Record<string, number> = {};
    let online: string[] = [];
    try {
      [livePings, online] = await Promise.all([
        sparkPings(),
        listOnlinePlayers().then((l) => l.names),
      ]);
    } catch {}

    // ping history per player (last hour) for sparklines
    const history = db()
      .prepare("SELECT player, ts, ping FROM ping_samples WHERE ts > ? ORDER BY ts ASC")
      .all(Date.now() - 60 * 60 * 1000) as Array<{ player: string; ts: number; ping: number }>;
    const historyByPlayer: Record<string, Array<{ ts: number; ping: number }>> = {};
    for (const h of history) {
      (historyByPlayer[h.player] ??= []).push({ ts: h.ts, ping: h.ping });
    }

    const serverHealthy = (tps === null || tps >= 18) && (mspt === null || mspt <= 40);
    const players = online.map((name) => {
      const ping = livePings[name] ?? null;
      return {
        name,
        ping,
        history: historyByPlayer[name] ?? [],
        verdict:
          ping === null
            ? "unknown"
            : ping > 250
              ? "bad-connection"
              : ping > 120
                ? "weak-connection"
                : "good",
      };
    });

    let verdict: string;
    if (tps === null && mspt === null) {
      verdict = "no-data";
    } else if (!serverHealthy) {
      verdict = "server-lagging";
    } else if (players.some((p) => p.verdict === "bad-connection" || p.verdict === "weak-connection")) {
      verdict = "player-connections";
    } else {
      verdict = "all-good";
    }

    return ok({ tps, mspt, cpu, serverHealthy, verdict, players });
  });
}
