import { db, getBoolSetting, getSetting } from "./db";
import { bus } from "./bus";
import { env } from "./env";

export type NotificationLevel = "info" | "success" | "warn" | "error";

/**
 * Panel notifications: stored for the notification center, fanned out live
 * over SSE, and optionally mirrored to a Discord webhook.
 */
export function notify(
  level: NotificationLevel,
  title: string,
  body = "",
  opts: { discord?: boolean } = {}
) {
  const ts = Date.now();
  const res = db()
    .prepare("INSERT INTO notifications(ts, level, title, body) VALUES(?, ?, ?, ?)")
    .run(ts, level, title, body);
  bus().emit("notification", { id: Number(res.lastInsertRowid), ts, level, title, body, read: 0 });

  if (opts.discord !== false) void sendDiscord(level, title, body);
}

const LEVEL_COLORS: Record<NotificationLevel, number> = {
  info: 0x60a5fa,
  success: 0x4ade80,
  warn: 0xfbbf24,
  error: 0xf87171,
};

async function sendDiscord(level: NotificationLevel, title: string, body: string) {
  if (!getBoolSetting("discord_enabled", true)) return;
  const url = getSetting("discord_webhook_url", env.discordWebhookUrl);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "CraftDeck",
        embeds: [
          {
            title,
            description: body || undefined,
            color: LEVEL_COLORS[level],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Discord being down must never break the panel.
  }
}
