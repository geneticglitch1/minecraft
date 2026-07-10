import { rcon, stripColors, RconError } from "./rcon";

/**
 * Game-level operations on top of RCON: player list, whitelist, EasyAuth
 * account management, and spark performance queries. All parsers are
 * intentionally tolerant of minor message-format changes between versions.
 */

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export function isValidUsername(name: string): boolean {
  return NAME_RE.test(name);
}

function assertValidUsername(name: string) {
  if (!isValidUsername(name)) throw new Error(`Invalid Minecraft username: ${name}`);
}

// ── players ─────────────────────────────────────────────────────────────

export async function listOnlinePlayers(): Promise<{ online: number; max: number; names: string[] }> {
  const out = stripColors(await rcon().exec("list"));
  // "There are 2 of a max of 10 players online: Alice, Bob"
  const m = out.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/i);
  if (!m) return { online: 0, max: 0, names: [] };
  const names = m[3]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => NAME_RE.test(s));
  return { online: Number(m[1]), max: Number(m[2]), names };
}

export async function kickPlayer(name: string, reason: string): Promise<string> {
  assertValidUsername(name);
  return stripColors(await rcon().exec(`kick ${name} ${reason}`));
}

export async function say(message: string): Promise<void> {
  await rcon().exec(`say ${message.replace(/\n/g, " ")}`);
}

// ── whitelist ───────────────────────────────────────────────────────────

export async function whitelistAdd(name: string): Promise<string> {
  assertValidUsername(name);
  return stripColors(await rcon().exec(`whitelist add ${name}`));
}

export async function whitelistRemove(name: string): Promise<string> {
  assertValidUsername(name);
  return stripColors(await rcon().exec(`whitelist remove ${name}`));
}

export async function whitelistList(): Promise<string[]> {
  const out = stripColors(await rcon().exec("whitelist list"));
  // "There are 3 whitelisted player(s): Alice, Bob, Carol"
  const colon = out.indexOf(":");
  if (colon < 0) return [];
  return out
    .slice(colon + 1)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => NAME_RE.test(s));
}

// ── EasyAuth ────────────────────────────────────────────────────────────

/** Registered account names according to EasyAuth. */
export async function easyauthList(): Promise<string[]> {
  const out = stripColors(await rcon().exec("auth list"));
  // Output is a list of registered usernames; extract all name-like tokens
  // after a colon if present, otherwise from the whole string.
  const colon = out.indexOf(":");
  const source = colon >= 0 ? out.slice(colon + 1) : out;
  const names = source.match(/[A-Za-z0-9_]{3,16}/g) ?? [];
  // Filter obvious non-name words that may appear in the message.
  const noise = new Set(["registered", "players", "list", "accounts", "there", "are", "the"]);
  return [...new Set(names.filter((n) => !noise.has(n.toLowerCase())))];
}

export async function easyauthRemove(name: string): Promise<string> {
  assertValidUsername(name);
  return stripColors(await rcon().exec(`auth remove ${name}`));
}

export async function easyauthSetPassword(name: string, password: string): Promise<string> {
  assertValidUsername(name);
  if (!/^[\x21-\x7e]{1,64}$/.test(password)) throw new Error("Unsupported password characters");
  return stripColors(await rcon().exec(`auth update ${name} ${password}`));
}

// ── spark (performance) ─────────────────────────────────────────────────

export type TpsSample = { tps: number | null; mspt: number | null };

export async function sparkTps(): Promise<TpsSample> {
  try {
    const out = stripColors(await rcon().exec("spark tps"));
    // "TPS from last 5s, 10s, 1m, 5m, 15m: 20.0, 20.0, 20.0, 20.0, 20.0"
    // "Tick durations (min/med/95%ile/max ms) from last 10s, 1m: 0.8/1.2/2.4/8.0; ..."
    const tpsMatch = out.match(/TPS[^:]*:\s*\*?([\d.]+)/i);
    const msptMatch = out.match(/durations[^:]*:\s*[\d.]+\/([\d.]+)/i);
    return {
      tps: tpsMatch ? Math.min(Number(tpsMatch[1]), 20) : null,
      mspt: msptMatch ? Number(msptMatch[1]) : null,
    };
  } catch (err) {
    if (err instanceof RconError) return { tps: null, mspt: null };
    throw err;
  }
}

/** Per-player ping in ms, via spark. */
export async function sparkPings(): Promise<Record<string, number>> {
  try {
    const out = stripColors(await rcon().exec("spark ping"));
    // Lines like "Alice: 23ms" / "Average Ping: 25.3ms"
    const result: Record<string, number> = {};
    for (const m of out.matchAll(/([A-Za-z0-9_]{3,16})\s*[:-]\s*([\d.]+)\s*ms/g)) {
      if (m[1].toLowerCase() === "ping") continue;
      result[m[1]] = Math.round(Number(m[2]));
    }
    return result;
  } catch {
    return {};
  }
}

export async function sparkHealthReport(): Promise<string> {
  return stripColors(await rcon().exec("spark healthreport"));
}
