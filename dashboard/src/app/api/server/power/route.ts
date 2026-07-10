import { NextRequest } from "next/server";
import { powerContainer, type PowerAction } from "@/server/docker";
import { logActivity } from "@/server/db";
import { notify } from "@/server/notify";
import { env } from "@/server/env";
import { ok, fail, readJson, handle } from "@/server/api";

const ACTIONS: PowerAction[] = ["start", "stop", "restart", "kill"];

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { action } = await readJson<{ action?: PowerAction }>(req);
    if (!action || !ACTIONS.includes(action)) return fail("Invalid power action");
    await powerContainer(env.mcContainer, action);
    logActivity("power", null, action);
    notify("info", `Server ${action} requested from the panel`, "", { discord: false });
    return ok({ action });
  });
}
