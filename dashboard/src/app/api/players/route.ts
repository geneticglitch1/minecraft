import { listOnlinePlayers } from "@/server/mc";
import { readAllPlayerStats } from "@/server/playerstats";
import { db } from "@/server/db";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    let online: string[] = [];
    let max = 0;
    try {
      const list = await listOnlinePlayers();
      online = list.names;
      max = list.max;
    } catch {}

    const stats = readAllPlayerStats();

    // latest ping per player (last 10 minutes)
    const pings = db()
      .prepare(
        `SELECT player, ping FROM ping_samples
         WHERE ts > ? AND id IN (SELECT MAX(id) FROM ping_samples GROUP BY player)`
      )
      .all(Date.now() - 10 * 60 * 1000) as Array<{ player: string; ping: number }>;
    const pingMap = Object.fromEntries(pings.map((p) => [p.player.toLowerCase(), p.ping]));

    const approved = db()
      .prepare("SELECT username, status, last_seen_at FROM approved_players")
      .all() as Array<{ username: string; status: string; last_seen_at: number | null }>;
    const approvedMap = Object.fromEntries(approved.map((a) => [a.username.toLowerCase(), a]));

    return ok({
      online,
      max,
      players: stats.map((s) => ({
        ...s,
        isOnline: online.some((n) => n.toLowerCase() === s.name.toLowerCase()),
        ping: pingMap[s.name.toLowerCase()] ?? null,
        authStatus: approvedMap[s.name.toLowerCase()]?.status ?? null,
        lastSeenAt: approvedMap[s.name.toLowerCase()]?.last_seen_at ?? null,
      })),
    });
  });
}
