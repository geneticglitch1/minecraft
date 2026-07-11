import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { rcon, stripColors, RconError } from "./rcon";
import { execInContainer } from "./docker";
import { env } from "./env";

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
//
// In offline mode the whitelist matches by UUID, and the UUID of an offline
// player is derived from their name (md5 of "OfflinePlayer:<name>", UUID v3).
// The vanilla `whitelist add` command instead asks Mojang's API for the name
// and stores the *premium* account's UUID — so a friend who has never joined
// gets "You are not white-listed" even though their name is on the list.
// We therefore write whitelist.json ourselves with the correct offline UUID
// and just tell the server to reload it.

/** Java's UUID.nameUUIDFromBytes("OfflinePlayer:<name>") — what offline servers assign. */
export function offlineUuid(name: string): string {
  const hash = createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x30; // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80; // IETF variant
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type WhitelistEntry = { uuid: string; name: string };

function whitelistPath(): string {
  return path.join(env.mcDataDir, "whitelist.json");
}

function readWhitelistFile(): WhitelistEntry[] {
  try {
    const data = JSON.parse(fs.readFileSync(whitelistPath(), "utf8"));
    return Array.isArray(data) ? (data as WhitelistEntry[]) : [];
  } catch {
    return [];
  }
}

function writeWhitelistFile(entries: WhitelistEntry[]) {
  fs.writeFileSync(whitelistPath(), JSON.stringify(entries, null, 2) + "\n");
  try {
    fs.chownSync(whitelistPath(), 1000, 1000); // keep it writable by the MC user
  } catch {}
}

async function reloadWhitelist(): Promise<void> {
  await rcon().exec("whitelist reload");
}

export async function whitelistAdd(name: string): Promise<string> {
  assertValidUsername(name);
  const entries = readWhitelistFile().filter((e) => e.name.toLowerCase() !== name.toLowerCase());
  entries.push({ uuid: offlineUuid(name), name });
  writeWhitelistFile(entries);
  await reloadWhitelist();
  return `Added ${name} to the whitelist (offline UUID)`;
}

export async function whitelistRemove(name: string): Promise<string> {
  assertValidUsername(name);
  writeWhitelistFile(readWhitelistFile().filter((e) => e.name.toLowerCase() !== name.toLowerCase()));
  await reloadWhitelist();
  return `Removed ${name} from the whitelist`;
}

export async function whitelistList(): Promise<string[]> {
  const fromFile = readWhitelistFile()
    .map((e) => e.name)
    .filter((n) => NAME_RE.test(n));
  if (fromFile.length > 0) return fromFile;
  // fallback: ask the server (e.g. data dir not mounted in dev)
  try {
    const out = stripColors(await rcon().exec("whitelist list"));
    const colon = out.indexOf(":");
    if (colon < 0) return [];
    return out
      .slice(colon + 1)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => NAME_RE.test(s));
  } catch {
    return [];
  }
}

/**
 * The server's *live* whitelist (what it actually enforces), as opposed to
 * the file. Used by the auth watcher to detect a missed `whitelist reload`
 * and heal it.
 */
export async function whitelistLive(): Promise<string[]> {
  const out = stripColors(await rcon().exec("whitelist list"));
  const colon = out.indexOf(":");
  if (colon < 0) return [];
  return out
    .slice(colon + 1)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => NAME_RE.test(s));
}

export { reloadWhitelist };

// ── bans ────────────────────────────────────────────────────────────────
//
// Ban/pardon go through the vanilla commands: for players who have joined
// before (the realistic case) the server already knows their offline UUID
// via usercache. IP bans take raw addresses and always work.

export type BanEntry = { name?: string; ip?: string; created?: string; reason?: string; source?: string };

function readBanFile(file: string): BanEntry[] {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(env.mcDataDir, file), "utf8"));
    return Array.isArray(data) ? (data as BanEntry[]) : [];
  } catch {
    return [];
  }
}

export function listBans(): { players: BanEntry[]; ips: BanEntry[] } {
  return {
    players: readBanFile("banned-players.json"),
    ips: readBanFile("banned-ips.json"),
  };
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;

function assertValidIp(ip: string) {
  if (!IP_RE.test(ip)) throw new Error(`Invalid IP address: ${ip}`);
}

function sanitizeReason(reason: string): string {
  return reason.replace(/[\r\n]/g, " ").slice(0, 120);
}

export async function banPlayer(name: string, reason = "Banned by the admin"): Promise<string> {
  assertValidUsername(name);
  const out = stripColors(await rcon().exec(`ban ${name} ${sanitizeReason(reason)}`));
  try {
    await kickPlayer(name, reason);
  } catch {}
  return out;
}

export async function pardonPlayer(name: string): Promise<string> {
  assertValidUsername(name);
  return stripColors(await rcon().exec(`pardon ${name}`));
}

export async function banIp(ip: string, reason = "Banned by the admin"): Promise<string> {
  assertValidIp(ip);
  return stripColors(await rcon().exec(`ban-ip ${ip} ${sanitizeReason(reason)}`));
}

export async function pardonIp(ip: string): Promise<string> {
  assertValidIp(ip);
  return stripColors(await rcon().exec(`pardon-ip ${ip}`));
}

// ── admin controls ──────────────────────────────────────────────────────

const GAMEMODES = new Set(["survival", "creative", "adventure", "spectator"]);
const DIFFICULTIES = new Set(["peaceful", "easy", "normal", "hard"]);

/**
 * Gamerules the panel exposes as toggles. Minecraft 26.x renamed every rule
 * to snake_case (keepInventory → keep_inventory, doDaylightCycle →
 * advance_time, ...) with old names deprecated — so each toggle carries
 * candidate names and the working one is resolved against the live server
 * and cached.
 */
export const TOGGLE_GAMERULES: Record<string, string[]> = {
  keep_inventory: ["keep_inventory", "keepInventory"],
  mob_griefing: ["mob_griefing", "mobGriefing"],
  advance_time: ["advance_time", "doDaylightCycle"],
  advance_weather: ["advance_weather", "weather_cycle", "doWeatherCycle"],
  pvp: ["pvp"],
};

const resolvedRuleNames = new Map<string, string>();

/** Query one gamerule, returning its value and the name that worked. */
async function queryGamerule(key: string): Promise<{ name: string; value: boolean } | null> {
  const cached = resolvedRuleNames.get(key);
  const candidates = cached ? [cached] : TOGGLE_GAMERULES[key];
  for (const name of candidates) {
    try {
      const out = stripColors(await rcon().exec(`gamerule ${name}`));
      const m = out.match(/\b(true|false)\b/i);
      if (m) {
        resolvedRuleNames.set(key, name);
        return { name, value: m[1].toLowerCase() === "true" };
      }
    } catch {
      return null; // RCON down — no point trying other names
    }
  }
  if (cached) resolvedRuleNames.delete(key); // cached name stopped working (version change)
  return null;
}

export async function setGamemode(name: string, mode: string): Promise<string> {
  assertValidUsername(name);
  if (!GAMEMODES.has(mode)) throw new Error("Invalid gamemode");
  return stripColors(await rcon().exec(`gamemode ${mode} ${name}`));
}

export async function opPlayer(name: string, grant: boolean): Promise<string> {
  assertValidUsername(name);
  return stripColors(await rcon().exec(`${grant ? "op" : "deop"} ${name}`));
}

export async function setTime(value: "day" | "night" | "noon" | "midnight"): Promise<void> {
  if (!["day", "night", "noon", "midnight"].includes(value)) throw new Error("Invalid time");
  await rcon().exec(`time set ${value}`);
}

export async function setWeather(value: "clear" | "rain" | "thunder"): Promise<void> {
  if (!["clear", "rain", "thunder"].includes(value)) throw new Error("Invalid weather");
  await rcon().exec(`weather ${value}`);
}

export async function setDifficulty(value: string): Promise<string> {
  if (!DIFFICULTIES.has(value)) throw new Error("Invalid difficulty");
  return stripColors(await rcon().exec(`difficulty ${value}`));
}

export async function getGamerules(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(TOGGLE_GAMERULES)) {
    const res = await queryGamerule(key);
    if (res) out[key] = res.value;
  }
  return out;
}

/** Set a gamerule and verify the server actually applied it. */
export async function setGamerule(key: string, value: boolean): Promise<boolean> {
  if (!(key in TOGGLE_GAMERULES)) throw new Error("Gamerule not allowed");
  const before = await queryGamerule(key);
  if (!before) {
    throw new Error(`The server doesn't recognize this gamerule (tried: ${TOGGLE_GAMERULES[key].join(", ")})`);
  }
  const setOut = stripColors(await rcon().exec(`gamerule ${before.name} ${value}`));
  const after = await queryGamerule(key);
  if (!after || after.value !== value) {
    throw new Error(`Server refused the change: ${setOut.trim() || "no response"}`);
  }
  return after.value;
}

/** Run a command and throw if the server's reply reads like a command error. */
async function execChecked(command: string): Promise<string> {
  const out = stripColors(await rcon().exec(command));
  if (/unknown|incorrect|expected|invalid|no (?:player|entity) was found/i.test(out)) {
    throw new Error(out.trim().slice(0, 200));
  }
  return out;
}

/** Full-screen title (with chat fallback text left to the caller). */
export async function broadcastTitle(message: string): Promise<void> {
  const json = JSON.stringify({ text: message.slice(0, 100), color: "green" });
  await execChecked(`title @a title ${json}`);
}

const ITEM_ID_RE = /^[a-z0-9_]+(:[a-z0-9_/]+)?$/;

export async function giveItem(name: string, item: string, count: number): Promise<string> {
  assertValidUsername(name);
  const id = item.trim().toLowerCase();
  if (!ITEM_ID_RE.test(id)) throw new Error("Invalid item id (e.g. diamond or minecraft:cooked_beef)");
  const n = Math.max(1, Math.min(Math.floor(count) || 1, 6400));
  return execChecked(`give ${name} ${id} ${n}`);
}

export async function teleportToPlayer(name: string, target: string): Promise<string> {
  assertValidUsername(name);
  assertValidUsername(target);
  return execChecked(`tp ${name} ${target}`);
}

/** Top up health and food — the classic admin favor. */
export async function healPlayer(name: string): Promise<void> {
  assertValidUsername(name);
  await execChecked(`effect give ${name} minecraft:instant_health 1 10`);
  await execChecked(`effect give ${name} minecraft:saturation 1 10`);
}

export async function kickAll(reason: string): Promise<number> {
  const { names } = await listOnlinePlayers();
  for (const name of names) {
    try {
      await kickPlayer(name, reason);
    } catch {}
  }
  return names.length;
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

/**
 * Primary TPS/MSPT source: vanilla `tick query`. Unlike spark, its output is
 * returned synchronously over RCON. Typical output:
 *   "The game is running normally / Target tick rate: 20.0 per second. /
 *    Average time per tick: 2.1ms (Target: 50.0ms) ..."
 */
export async function tickQueryTps(): Promise<TpsSample | null> {
  const out = stripColors(await rcon().exec("tick query"));
  const target = Number(out.match(/tick rate:\s*([\d.]+)/i)?.[1]) || 20;
  if (/paused|frozen/i.test(out)) {
    // pause-when-empty idle state — the server is keeping up by definition
    return { tps: target, mspt: null };
  }
  const mspt = out.match(/per tick:\s*([\d.]+)\s*ms/i);
  if (!mspt) return null;
  const ms = Number(mspt[1]);
  const tps = ms > 0 ? Math.min(target, 1000 / ms) : target;
  return { tps: Math.round(tps * 10) / 10, mspt: ms };
}

/** TPS with fallback chain: tick query → spark → nulls. */
export async function queryTps(): Promise<TpsSample> {
  try {
    const t = await tickQueryTps();
    if (t) return t;
  } catch (err) {
    if (err instanceof RconError) return { tps: null, mspt: null };
    throw err;
  }
  return sparkTps();
}

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
  const out = stripColors(await rcon().exec("spark healthreport"));
  if (out.trim()) return out;
  // spark replies asynchronously; over RCON the response is often empty.
  // Route the command through the server's real console instead — the report
  // then shows up in the live log.
  try {
    await execInContainer(env.mcContainer, ["mc-send-to-console", "spark", "healthreport"], 15_000);
    return "spark replies asynchronously, so the report can't be captured here.\nIt was sent to the server console instead — open the Console page to read it (takes a few seconds).";
  } catch {
    return "spark did not return output over RCON, and sending to the server console failed.";
  }
}
