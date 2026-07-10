import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

const RANGES: Record<string, { ms: number; bucketMs: number }> = {
  "1h": { ms: 60 * 60 * 1000, bucketMs: 10 * 1000 },
  "6h": { ms: 6 * 60 * 60 * 1000, bucketMs: 60 * 1000 },
  "24h": { ms: 24 * 60 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 30 * 60 * 1000 },
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const range = RANGES[req.nextUrl.searchParams.get("range") ?? "1h"] ?? RANGES["1h"];
    const since = Date.now() - range.ms;
    // Bucket-average so long ranges stay light on the wire.
    const rows = db()
      .prepare(
        `SELECT (ts / ?) * ? AS bucket,
                AVG(cpu) AS cpu, AVG(mem_used) AS mem_used, MAX(mem_limit) AS mem_limit,
                MAX(net_rx) AS net_rx, MAX(net_tx) AS net_tx,
                AVG(tps) AS tps, AVG(mspt) AS mspt, MAX(players) AS players,
                AVG(disk_used) AS disk_used, AVG(disk_free) AS disk_free
         FROM metrics WHERE ts > ?
         GROUP BY bucket ORDER BY bucket ASC`
      )
      .all(range.bucketMs, range.bucketMs, since);
    return ok(rows);
  });
}
