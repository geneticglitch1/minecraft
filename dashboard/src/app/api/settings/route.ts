import { NextRequest } from "next/server";
import { getSetting, setSetting, getBoolSetting } from "@/server/db";
import { env } from "@/server/env";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    return ok({
      registrationWindowMinutes: Number(
        getSetting("registration_window_minutes", String(env.registrationWindowMinutes))
      ),
      notifyJoins: getBoolSetting("notify_joins", true),
      discordEnabled: getBoolSetting("discord_enabled", true),
      discordJoins: getBoolSetting("discord_joins", true),
      discordWebhookUrl: getSetting("discord_webhook_url", env.discordWebhookUrl),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Record<string, unknown>>(req);
    if (body.registrationWindowMinutes !== undefined) {
      const n = Number(body.registrationWindowMinutes);
      if (!Number.isFinite(n) || n < 0.5 || n > 120) return fail("Window must be between 0.5 and 120 minutes");
      setSetting("registration_window_minutes", String(n));
    }
    if (body.notifyJoins !== undefined) setSetting("notify_joins", body.notifyJoins ? "1" : "0");
    if (body.discordEnabled !== undefined) setSetting("discord_enabled", body.discordEnabled ? "1" : "0");
    if (body.discordJoins !== undefined) setSetting("discord_joins", body.discordJoins ? "1" : "0");
    if (body.discordWebhookUrl !== undefined) {
      const url = String(body.discordWebhookUrl);
      if (url && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
        return fail("Not a Discord webhook URL");
      }
      setSetting("discord_webhook_url", url);
    }
    return ok({ saved: true });
  });
}
