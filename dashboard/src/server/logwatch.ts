import { streamContainerLogs, type LogStreamHandle } from "./docker";
import { bus, pushLogLine } from "./bus";
import { db, logActivity, getBoolSetting } from "./db";
import { notify } from "./notify";
import { env } from "./env";

/**
 * Tails the Minecraft container's console, feeds the live console stream,
 * and parses game events (joins, leaves, server ready, ...) into the
 * activity feed + notifications.
 */

type State = {
  handle: LogStreamHandle | null;
  attachedAt: number;
  timer: NodeJS.Timeout | null;
};

const g = globalThis as unknown as { __craftdeckLogwatch?: State };

// Strip "[12:34:56] [Server thread/INFO]: " style prefixes.
function messageOf(line: string): string {
  const m = line.match(/^\[[^\]]*\]\s*\[[^\]]*\]:?\s*(.*)$/);
  return m ? m[1] : line;
}

// Bots hammer the port — notify at most once per name+IP per 10 minutes.
// (Every attempt is still recorded in the activity feed.)
const blockedNotifyAt = new Map<string, number>();

function shouldNotifyBlocked(key: string): boolean {
  const now = Date.now();
  const last = blockedNotifyAt.get(key) ?? 0;
  if (now - last < 10 * 60 * 1000) return false;
  blockedNotifyAt.set(key, now);
  if (blockedNotifyAt.size > 500) blockedNotifyAt.clear();
  return true;
}

function parseEvent(line: string, backfill: boolean) {
  const msg = messageOf(line).replace(/§[0-9a-fk-or]/gi, "");

  // spark ping output routed through the console (see sampler fallback):
  // "[⚡] Alice: 23ms"
  const ping = msg.match(/\[⚡\]\s*([A-Za-z0-9_]{3,16}):\s*([\d.]+)\s*ms/);
  if (ping && !backfill) {
    db()
      .prepare("INSERT INTO ping_samples(ts, player, ping) VALUES(?, ?, ?)")
      .run(Date.now(), ping[1], Math.round(Number(ping[2])));
    return;
  }

  const emit = (type: string, player?: string, detail?: string) => {
    if (backfill) return; // don't re-record history after a panel restart
    logActivity(type, player, detail);
    if (player) touchLastSeen(player, type);
    bus().emit("mc-event", { ts: Date.now(), type, player, detail });
    if (type === "join" && getBoolSetting("notify_joins", true)) {
      notify("info", `${player} joined the server`, "", { discord: getBoolSetting("discord_joins", true) });
    }
    if (type === "leave" && getBoolSetting("notify_joins", true)) {
      notify("info", `${player} left the server`, "", { discord: getBoolSetting("discord_joins", true) });
    }
    if (type === "server_online") {
      notify("success", "Server is online", detail ?? "");
    }
  };

  let m;
  if (
    (m = msg.match(
      /^Disconnecting ([A-Za-z0-9_]{3,16}) \(\/([0-9a-fA-F.:]+):\d+\): (You are not white-listed[^!]*!?|.*banned.*)/i
    ))
  ) {
    // Somebody the panel never approved knocked on the door (usually an
    // internet scanner bot). Record it so the admin can see and IP-ban them.
    if (!backfill) {
      logActivity("blocked", m[1], m[2]);
      bus().emit("mc-event", { ts: Date.now(), type: "blocked", player: m[1], detail: m[2] });
      if (getBoolSetting("notify_blocked", true) && shouldNotifyBlocked(`${m[1]}@${m[2]}`)) {
        notify("warn", `Blocked join attempt: ${m[1]}`, `From ${m[2]} — ${m[3]}`, {
          discord: getBoolSetting("discord_blocked", true),
        });
      }
    }
  } else if ((m = msg.match(/^([A-Za-z0-9_]{3,16}) joined the game/))) {
    emit("join", m[1]);
  } else if ((m = msg.match(/^([A-Za-z0-9_]{3,16}) left the game/))) {
    emit("leave", m[1]);
  } else if ((m = msg.match(/^([A-Za-z0-9_]{3,16})\[\/([0-9a-fA-F.:]+):\d+\] logged in/))) {
    emit("connect", m[1], m[2]);
  } else if ((m = msg.match(/^Done \(([\d.]+)s\)/))) {
    emit("server_online", undefined, `Started in ${m[1]}s`);
  } else if (/^Stopping the server|^Stopping server/.test(msg)) {
    emit("server_stopping");
  } else if (/registered/i.test(msg) && !backfill) {
    // EasyAuth registration hint — the auth watcher reconciles immediately.
    bus().emit("mc-event", { ts: Date.now(), type: "register-hint" });
  }
}

function touchLastSeen(player: string, type: string) {
  if (type !== "join" && type !== "leave" && type !== "connect") return;
  db()
    .prepare("UPDATE approved_players SET last_seen_at = ? WHERE username = ?")
    .run(Date.now(), player);
}

function attach(state: State) {
  state.attachedAt = Date.now();
  state.handle = streamContainerLogs(
    env.mcContainer,
    { tail: 200, follow: true },
    (line) => {
      pushLogLine(line);
      // Lines arriving in the first 2s are the tail backfill, not live events.
      parseEvent(line, Date.now() - state.attachedAt < 2000);
    },
    () => {
      state.handle = null; // container stopped or docker went away; retry loop reattaches
    }
  );
}

export function startLogWatcher() {
  if (g.__craftdeckLogwatch) return;
  const state: State = { handle: null, attachedAt: 0, timer: null };
  g.__craftdeckLogwatch = state;
  attach(state);
  state.timer = setInterval(() => {
    if (!state.handle) attach(state);
  }, 5000);
}
