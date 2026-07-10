import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Player statistics from the world's stats/*.json files (written by the
 * server) joined with usercache.json for name↔UUID mapping. Works with
 * offline-mode UUIDs.
 */

type UserCacheEntry = { name: string; uuid: string };

export type PlayerStats = {
  name: string;
  uuid: string;
  playTimeHours: number;
  deaths: number;
  mobKills: number;
  playerKills: number;
  distanceKm: number;
  jumps: number;
  damageDealt: number;
  blocksMined: number;
  lastModified: number;
};

function worldDir(): string {
  return path.join(env.mcDataDir, "world");
}

export function readUserCache(): UserCacheEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(env.mcDataDir, "usercache.json"), "utf8"));
    if (Array.isArray(raw)) return raw as UserCacheEntry[];
  } catch {}
  return [];
}

function num(obj: Record<string, number> | undefined, key: string): number {
  return obj?.[key] ?? 0;
}

export function readAllPlayerStats(): PlayerStats[] {
  const statsDir = path.join(worldDir(), "stats");
  let files: string[];
  try {
    files = fs.readdirSync(statsDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const nameByUuid = new Map(readUserCache().map((e) => [e.uuid.toLowerCase(), e.name]));
  const out: PlayerStats[] = [];

  for (const file of files) {
    const uuid = file.replace(/\.json$/, "");
    let data: { stats?: Record<string, Record<string, number>> };
    let mtime = 0;
    try {
      const full = path.join(statsDir, file);
      mtime = fs.statSync(full).mtimeMs;
      data = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    const s = data.stats ?? {};
    const custom = s["minecraft:custom"];
    // distance stats are in centimeters
    const distanceCm =
      num(custom, "minecraft:walk_one_cm") +
      num(custom, "minecraft:sprint_one_cm") +
      num(custom, "minecraft:swim_one_cm") +
      num(custom, "minecraft:fly_one_cm") +
      num(custom, "minecraft:boat_one_cm") +
      num(custom, "minecraft:horse_one_cm") +
      num(custom, "minecraft:minecart_one_cm");
    const blocksMined = Object.values(s["minecraft:mined"] ?? {}).reduce((a, b) => a + b, 0);

    out.push({
      name: nameByUuid.get(uuid.toLowerCase()) ?? uuid.slice(0, 8),
      uuid,
      playTimeHours: Math.round((num(custom, "minecraft:play_time") / 20 / 3600) * 10) / 10,
      deaths: num(custom, "minecraft:deaths"),
      mobKills: num(custom, "minecraft:mob_kills"),
      playerKills: num(custom, "minecraft:player_kills"),
      distanceKm: Math.round(distanceCm / 100 / 1000),
      jumps: num(custom, "minecraft:jump"),
      damageDealt: Math.round(num(custom, "minecraft:damage_dealt") / 10),
      blocksMined,
      lastModified: mtime,
    });
  }
  return out.sort((a, b) => b.playTimeHours - a.playTimeHours);
}

export type WorldInfo = {
  seed: string | null;
  sizeBytes: number | null;
  dimensions: string[];
  levelName: string | null;
};

export function readWorldInfo(worldSizeBytes: number | null): WorldInfo {
  const dims: string[] = [];
  const wd = worldDir();
  if (fs.existsSync(wd)) dims.push("overworld");
  if (fs.existsSync(path.join(wd, "DIM-1"))) dims.push("nether");
  if (fs.existsSync(path.join(wd, "DIM1"))) dims.push("end");

  let seed: string | null = null;
  let levelName: string | null = null;
  try {
    const props = fs.readFileSync(path.join(env.mcDataDir, "server.properties"), "utf8");
    seed = props.match(/^level-seed=(.*)$/m)?.[1] || null;
    levelName = props.match(/^level-name=(.*)$/m)?.[1] || null;
  } catch {}
  return { seed, sizeBytes: worldSizeBytes, dimensions: dims, levelName };
}
