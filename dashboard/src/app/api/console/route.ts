import { NextRequest } from "next/server";
import { rcon, stripColors } from "@/server/rcon";
import { logActivity } from "@/server/db";
import { pushLogLine } from "@/server/bus";
import { ok, fail, readJson, handle } from "@/server/api";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { command } = await readJson<{ command?: string }>(req);
    if (!command?.trim()) return fail("Empty command");
    const cmd = command.trim().replace(/^\//, "");
    const output = stripColors(await rcon().exec(cmd));
    logActivity("console", null, cmd);
    // Echo the exchange into the live console stream so it reads like a terminal.
    pushLogLine(`> ${cmd}`);
    if (output.trim()) for (const line of output.split("\n")) pushLogLine(line);
    return ok({ output });
  });
}
