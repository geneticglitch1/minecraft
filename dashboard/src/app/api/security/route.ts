import { NextRequest } from "next/server";
import { db, logActivity } from "@/server/db";
import { listBans, banPlayer, pardonPlayer, banIp, pardonIp, kickAll } from "@/server/mc";
import { notify } from "@/server/notify";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const blocked = db()
      .prepare(
        `SELECT player, detail AS ip, COUNT(*) AS attempts, MAX(ts) AS last_ts, MIN(ts) AS first_ts
         FROM activity WHERE type = 'blocked' AND ts > ?
         GROUP BY player, detail ORDER BY last_ts DESC LIMIT 100`
      )
      .all(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return ok({ blocked, bans: listBans() });
  });
}

type Body =
  | { op: "ban-player"; name: string; reason?: string }
  | { op: "pardon-player"; name: string }
  | { op: "ban-ip"; ip: string; reason?: string }
  | { op: "pardon-ip"; ip: string }
  | { op: "kick-all"; reason?: string };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    switch (body.op) {
      case "ban-player": {
        if (!body.name) return fail("Name required");
        const out = await banPlayer(body.name, body.reason);
        logActivity("ban", body.name, body.reason ?? null);
        notify("warn", `Banned ${body.name}`, body.reason ?? "", { discord: false });
        return ok({ output: out });
      }
      case "pardon-player": {
        if (!body.name) return fail("Name required");
        const out = await pardonPlayer(body.name);
        logActivity("pardon", body.name);
        return ok({ output: out });
      }
      case "ban-ip": {
        if (!body.ip) return fail("IP required");
        const out = await banIp(body.ip, body.reason);
        logActivity("ban_ip", null, body.ip);
        notify("warn", `Banned IP ${body.ip}`, body.reason ?? "", { discord: false });
        return ok({ output: out });
      }
      case "pardon-ip": {
        if (!body.ip) return fail("IP required");
        const out = await pardonIp(body.ip);
        logActivity("pardon_ip", null, body.ip);
        return ok({ output: out });
      }
      case "kick-all": {
        const count = await kickAll(body.reason ?? "The server is in lockdown — back soon!");
        logActivity("kick_all", null, `${count} player(s)`);
        notify("warn", "Kicked everyone", `${count} player(s) disconnected.`, { discord: false });
        return ok({ kicked: count });
      }
      default:
        return fail("Unknown operation");
    }
  });
}
