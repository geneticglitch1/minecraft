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
  | { op: "broadcast"; message: string };

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
        const out = await setGamerule(body.rule, body.value);
        logActivity("admin", null, `gamerule ${body.rule} ${body.value}`);
        return ok({ output: out });
      }
      case "broadcast": {
        if (!body.message?.trim()) return fail("Empty message");
        await say(body.message.trim().slice(0, 256));
        return ok({});
      }
      default:
        return fail("Unknown operation");
    }
  });
}
