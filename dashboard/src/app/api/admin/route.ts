import { NextRequest } from "next/server";
import {
  setGamemode,
  opPlayer,
  setTime,
  setWeather,
  setDifficulty,
  getGamerules,
  setGamerule,
  say,
  broadcastTitle,
  giveItem,
  teleportToPlayer,
  healPlayer,
} from "@/server/mc";
import { logActivity } from "@/server/db";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

/** Current values for the quick-controls card. */
export async function GET() {
  return handle(async () => {
    return ok({ gamerules: await getGamerules() });
  });
}

type Body =
  | { op: "gamemode"; name: string; mode: string }
  | { op: "op"; name: string; grant: boolean }
  | { op: "time"; value: "day" | "night" | "noon" | "midnight" }
  | { op: "weather"; value: "clear" | "rain" | "thunder" }
  | { op: "difficulty"; value: string }
  | { op: "gamerule"; rule: string; value: boolean }
  | { op: "broadcast"; message: string; style?: "chat" | "title" }
  | { op: "give"; name: string; item: string; count?: number }
  | { op: "teleport"; name: string; target: string }
  | { op: "heal"; name: string };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    switch (body.op) {
      case "gamemode": {
        const out = await setGamemode(body.name, body.mode);
        logActivity("admin", body.name, `gamemode ${body.mode}`);
        return ok({ output: out });
      }
      case "op": {
        const out = await opPlayer(body.name, body.grant);
        logActivity("admin", body.name, body.grant ? "op" : "deop");
        return ok({ output: out });
      }
      case "time":
        await setTime(body.value);
        return ok({});
      case "weather":
        await setWeather(body.value);
        return ok({});
      case "difficulty": {
        const out = await setDifficulty(body.value);
        logActivity("admin", null, `difficulty ${body.value}`);
        return ok({ output: out });
      }
      case "gamerule": {
        const applied = await setGamerule(body.rule, body.value);
        logActivity("admin", null, `gamerule ${body.rule} ${body.value}`);
        return ok({ value: applied });
      }
      case "broadcast": {
        if (!body.message?.trim()) return fail("Empty message");
        const message = body.message.trim().slice(0, 256);
        if (body.style === "title") {
          await broadcastTitle(message);
        } else {
          await say(message);
        }
        return ok({});
      }
      case "give": {
        const out = await giveItem(body.name, body.item, body.count ?? 1);
        logActivity("admin", body.name, `give ${body.item} ×${body.count ?? 1}`);
        return ok({ output: out });
      }
      case "teleport": {
        const out = await teleportToPlayer(body.name, body.target);
        logActivity("admin", body.name, `tp → ${body.target}`);
        return ok({ output: out });
      }
      case "heal": {
        await healPlayer(body.name);
        logActivity("admin", body.name, "heal");
        return ok({});
      }
      default:
        return fail("Unknown operation");
    }
  });
}
