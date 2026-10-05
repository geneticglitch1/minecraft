import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env";
import {
  LOADERS,
  defaultProfile,
  proxyCompatible,
  type NetworkConfig,
  type WorldProfile,
  type ProxySettings,
} from "@/lib/network";

export class NetworkInputError extends Error {}
export function networkFile() {
  return path.join(env.appDataDir, "network.json");
}
export function readNetwork(): NetworkConfig {
  if (!fs.existsSync(networkFile()))
    return {
      schema: 1,
      profiles: [],
      proxy: {
        port: 25566,
        lobby: "",
        motd: "A CraftDeck network",
        version: "latest",
      },
      jobs: [],
    };
  const value = JSON.parse(
    fs.readFileSync(networkFile(), "utf8"),
  ) as NetworkConfig;
  if (
    value.schema !== 1 ||
    !Array.isArray(value.profiles) ||
    !Array.isArray(value.jobs)
  )
    throw new Error(
      "Invalid network registry; restore network.json from backup",
    );
  return value;
}
export function atomicWrite(file: string, content: string, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, content, { mode });
  fs.renameSync(tmp, file);
}
export function writeNetwork(config: NetworkConfig) {
  atomicWrite(networkFile(), JSON.stringify(config, null, 2));
}
export function profileById(config: NetworkConfig, id: unknown) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))
    throw new NetworkInputError("Invalid server ID");
  const p = config.profiles.find((p) => p.id === id);
  if (!p) throw new NetworkInputError("Server profile not found");
  return p;
}
export function profileRoot(id: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))
    throw new NetworkInputError("Invalid server ID");
  return path.join(path.dirname(env.mcDataDir), "network", id);
}
function string(value: unknown, label: string, max = 200): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new NetworkInputError(`Invalid ${label}`);
  return value.trim();
}
function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new NetworkInputError(`${label} must be ${min}–${max}`);
  return Number(value);
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (!choices.includes(value as T))
    throw new NetworkInputError(`Invalid ${label}`);
  return value as T;
}
function bool(value: unknown, label: string) {
  if (typeof value !== "boolean")
    throw new NetworkInputError(`Invalid ${label}`);
  return value;
}
function url(value: unknown, label: string) {
  const s = string(value, label, 2000);
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new NetworkInputError(`${label} must be an HTTP(S) URL`);
  }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new NetworkInputError(`Invalid ${label}`);
  return s;
}
export function validateProfile(
  input: unknown,
  existing?: WorldProfile,
): WorldProfile {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new NetworkInputError("Missing profile");
  const v = { ...defaultProfile, ...input } as Record<string, unknown>;
  const name = string(v.name, "name", 60);
  if (!name) throw new NetworkInputError("Name is required");
  const version = string(v.version, "Minecraft version", 40);
  if (!/^[0-9][a-zA-Z0-9._-]*$/.test(version))
    throw new NetworkInputError(
      "Use an exact Minecraft release or snapshot version",
    );
  const p: WorldProfile = {
    id:
      existing?.id ??
      `${
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 28) || "world"
      }-${randomUUID().slice(0, 8)}`,
    createdAt: existing?.createdAt ?? Date.now(),
    name,
    version,
    loader: choice(v.loader, LOADERS, "loader"),
    java: choice(v.java, ["8", "17", "21", "25"], "Java runtime"),
    seed: string(v.seed, "seed", 128),
    memory: integer(v.memory, "Heap in GiB", 1, 128),
    maxPlayers: integer(v.maxPlayers, "Player slots", 1, 10000),
    difficulty: choice(
      v.difficulty,
      ["peaceful", "easy", "normal", "hard"],
      "difficulty",
    ),
    mode: choice(
      v.mode,
      ["survival", "creative", "adventure", "spectator"],
      "game mode",
    ),
    viewDistance: integer(v.viewDistance, "View distance", 2, 32),
    simulationDistance: integer(
      v.simulationDistance,
      "Simulation distance",
      2,
      32,
    ),
    pvp: bool(v.pvp, "PVP"),
    hardcore: bool(v.hardcore, "hardcore"),
    route: choice(v.route, ["proxy", "direct"], "connection mode"),
    port: integer(v.port, "Game port", 1024, 65535),
    hostname: string(v.hostname, "hostname", 253).toLowerCase(),
    mods: string(v.mods, "mods", 4000),
    modpack: string(v.modpack, "modpack", 100),
    modpackVersion: string(v.modpackVersion, "modpack version", 100),
    loaderVersion: string(v.loaderVersion, "loader version", 60),
    map: choice(v.map, ["none", "bluemap", "dynmap"], "map"),
    mapPort: integer(v.mapPort, "Map port", 1024, 65535),
    mapUrl: url(v.mapUrl, "Map URL"),
    resourcePack: url(v.resourcePack, "Resource pack URL"),
    resourcePackSha1: string(
      v.resourcePackSha1,
      "Resource pack SHA-1",
      40,
    ).toLowerCase(),
    resourcePackRequired: bool(v.resourcePackRequired, "Required pack"),
    resourcePackPrompt: string(v.resourcePackPrompt, "Pack prompt", 300),
    whitelist: string(v.whitelist, "whitelist", 8000),
    backupHours: integer(v.backupHours, "Backup interval", 1, 168),
    retentionDays: integer(v.retentionDays, "Backup retention", 1, 365),
  };
  for (const field of [p.modpack, p.modpackVersion, p.loaderVersion])
    if (field && !/^[a-zA-Z0-9._+-]+$/.test(field))
      throw new NetworkInputError(
        "Use loader/modpack IDs or versions, not URLs",
      );
  if (
    p.mods &&
    !p.mods.split(",").every((s) => /^[\w-]+(?::[\w.+-]+)?$/.test(s.trim()))
  )
    throw new NetworkInputError(
      "Mods must be comma-separated Modrinth slugs with optional :version IDs",
    );
  if (
    p.whitelist &&
    !p.whitelist.split(",").every((s) => /^[a-zA-Z0-9_]{3,16}$/.test(s.trim()))
  )
    throw new NetworkInputError(
      "Whitelist must contain comma-separated Minecraft usernames",
    );
  if (
    p.hostname &&
    !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(p.hostname)
  )
    throw new NetworkInputError("Invalid hostname");
  if (p.route === "proxy" && !proxyCompatible(p.loader))
    throw new NetworkInputError(
      "Automatic secure proxy routing supports Paper and Folia; use a direct port for this loader",
    );
  if (
    p.route === "proxy" &&
    /^1\.(\d+)/.test(p.version) &&
    Number(p.version.split(".")[1]) < 19
  )
    throw new NetworkInputError(
      "Managed proxy profiles require Paper/Folia 1.19 or newer",
    );
  if (p.loader === "MODRINTH" && (!p.modpack || !p.modpackVersion))
    throw new NetworkInputError(
      "Choose a Modrinth pack and an exact pack version ID",
    );
  if (p.loader !== "MODRINTH" && p.modpack)
    throw new NetworkInputError(
      "Select Modrinth modpack as the runtime to install a pack",
    );
  if (p.map !== "none" && ["VANILLA", "MODRINTH"].includes(p.loader))
    throw new NetworkInputError(
      "Automatic map installation needs an explicit mod/plugin loader",
    );
  if (p.resourcePackSha1 && !/^[a-f0-9]{40}$/.test(p.resourcePackSha1))
    throw new NetworkInputError(
      "Resource pack SHA-1 must be 40 hexadecimal characters",
    );
  if (p.resourcePack && !p.resourcePackSha1)
    throw new NetworkInputError(
      "Provide the resource pack SHA-1 so clients can verify downloads",
    );
  if (p.resourcePackRequired && !p.resourcePack)
    throw new NetworkInputError("Required resource packs need a download URL");
  if (existing)
    for (const key of [
      "loader",
      "version",
      "java",
      "modpack",
      "modpackVersion",
      "seed",
      "route",
    ] as const) {
      if (
        existing[key] !== p[key] &&
        fs.existsSync(
          path.join(profileRoot(existing.id), "data", "server.properties"),
        )
      )
        throw new NetworkInputError(
          "Create a new profile for seed, version, runtime, pack or authentication changes; existing world data stays intact",
        );
    }
  return p;
}
export function validateProxy(
  input: unknown,
  config: NetworkConfig,
): ProxySettings {
  if (!input || typeof input !== "object")
    throw new NetworkInputError("Missing proxy configuration");
  const v = input as Record<string, unknown>;
  const p = {
    port: integer(v.port, "Proxy port", 1024, 65535),
    lobby: string(v.lobby, "lobby", 48),
    motd: string(v.motd, "MOTD", 200),
    version: string(v.version, "Velocity version", 40),
  };
  if (!/^[a-zA-Z0-9._+-]+$/.test(p.version))
    throw new NetworkInputError("Invalid Velocity version");
  if (!config.profiles.some((s) => s.id === p.lobby && s.route === "proxy"))
    throw new NetworkInputError(
      "Choose a Paper/Folia proxy profile as the lobby",
    );
  return p;
}
export function validatePorts(
  config: NetworkConfig,
  primaryPort: number,
  panelPort: number,
) {
  const used = new Map<number, string>([
    [primaryPort, "primary server"],
    [panelPort, "panel"],
  ]);
  const reserve = (port: number, name: string) => {
    if (used.has(port))
      throw new NetworkInputError(
        `Port ${port} is already assigned to ${used.get(port)}`,
      );
    used.set(port, name);
  };
  reserve(config.proxy.port, "proxy");
  const hosts = new Set<string>();
  for (const p of config.profiles) {
    if (p.route === "direct") reserve(p.port, p.name);
    if (p.map !== "none") reserve(p.mapPort, `${p.name} map`);
    if (p.route === "proxy" && p.hostname) {
      if (hosts.has(p.hostname))
        throw new NetworkInputError(`Duplicate hostname: ${p.hostname}`);
      hosts.add(p.hostname);
    }
  }
}
