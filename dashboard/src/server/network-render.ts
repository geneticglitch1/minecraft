import path from "node:path";
import type { NetworkConfig, WorldProfile } from "@/lib/network";

export const serverName = (id: string) => `craftdeck-${id}`;
export const backupName = (id: string) => `craftdeck-${id}-backup`;
export const proxyName = "craftdeck-velocity";
export function serverEnvironment(
  p: WorldProfile,
  password: string,
  mapProject = "",
) {
  const mods = [p.mods, mapProject].filter(Boolean).join(",");
  return {
    EULA: "TRUE",
    TYPE: p.loader,
    VERSION: p.version,
    MEMORY: `${p.memory}G`,
    ONLINE_MODE: p.route === "proxy" ? "FALSE" : "TRUE",
    ENFORCE_SECURE_PROFILE: p.route === "proxy" ? "FALSE" : "TRUE",
    ENABLE_WHITELIST: "TRUE",
    ENFORCE_WHITELIST: "TRUE",
    WHITELIST: p.whitelist,
    EXISTING_WHITELIST_FILE: "SYNCHRONIZE",
    ENABLE_RCON: "TRUE",
    RCON_PASSWORD: password,
    RCON_PORT: "25575",
    MOTD: p.name,
    SEED: p.seed,
    LEVEL: "world",
    DIFFICULTY: p.difficulty,
    MODE: p.mode,
    MAX_PLAYERS: String(p.maxPlayers),
    VIEW_DISTANCE: String(p.viewDistance),
    SIMULATION_DISTANCE: String(p.simulationDistance),
    PVP: String(p.pvp),
    HARDCORE: String(p.hardcore),
    SPAWN_PROTECTION: "0",
    MODRINTH_PROJECTS: mods,
    MODRINTH_DOWNLOAD_DEPENDENCIES: "required",
    ...(p.loader === "MODRINTH"
      ? { MODRINTH_MODPACK: p.modpack, MODRINTH_VERSION: p.modpackVersion }
      : {}),
    ...(p.loaderVersion
      ? {
          [(
            {
              FABRIC: "FABRIC_LOADER_VERSION",
              FORGE: "FORGE_VERSION",
              NEOFORGE: "NEOFORGE_VERSION",
              QUILT: "QUILT_LOADER_VERSION",
            } as Record<string, string>
          )[p.loader] ?? "PAPER_BUILD"]: p.loaderVersion,
        }
      : {}),
    RESOURCE_PACK: p.resourcePack,
    RESOURCE_PACK_SHA1: p.resourcePackSha1,
    RESOURCE_PACK_ENFORCE: String(p.resourcePackRequired),
    RESOURCE_PACK_PROMPT: p.resourcePackPrompt,
  };
}
const logging = {
  driver: "json-file",
  options: { "max-size": "10m", "max-file": "3" },
};
export function renderProfileCompose(
  p: WorldProfile,
  infra: { hostDataDir: string; network: string },
  password: string,
  mapProject: string,
) {
  const hostRoot = path.join(path.dirname(infra.hostDataDir), "network", p.id);
  return {
    name: `craftdeck-${p.id}`,
    services: {
      server: {
        image: `itzg/minecraft-server:java${p.java}`,
        container_name: serverName(p.id),
        restart: "unless-stopped",
        stop_grace_period: "2m",
        logging,
        environment: serverEnvironment(p, password, mapProject),
        mem_limit: `${p.memory + 1}g`,
        volumes: [`${hostRoot}/data:/data`],
        networks: ["stack"],
        ports: [
          ...(p.route === "direct" ? [`${p.port}:25565`] : []),
          ...(p.map !== "none"
            ? [`127.0.0.1:${p.mapPort}:${p.map === "bluemap" ? 8100 : 8123}`]
            : []),
        ],
      },
      backup: {
        image:
          "itzg/mc-backup:latest@sha256:5ddce05d917f7fb94c752e7be5aeb67ec043360615b0043d9b40a78809de0383",
        container_name: backupName(p.id),
        restart: "unless-stopped",
        logging,
        mem_limit: "512m",
        depends_on: { server: { condition: "service_healthy" } },
        networks: ["stack"],
        environment: {
          BACKUP_INTERVAL: `${p.backupHours}h`,
          INITIAL_DELAY: "10m",
          PRUNE_BACKUPS_DAYS: String(p.retentionDays),
          BACKUP_NAME: "world",
          TAR_COMPRESS_METHOD: "gzip",
          PAUSE_IF_NO_PLAYERS: "false",
          RCON_HOST: serverName(p.id),
          RCON_PORT: "25575",
          RCON_PASSWORD: password,
          EXCLUDES: "*.tmp,cache,logs",
        },
        volumes: [`${hostRoot}/data:/data:ro`, `${hostRoot}/backups:/backups`],
      },
    },
    networks: { stack: { external: true, name: infra.network } },
  };
}
export function renderVelocity(
  config: NetworkConfig,
  addresses: Record<string, string> = {},
) {
  const routes = config.profiles.filter((p) => p.route === "proxy");
  // JSON strings are valid TOML basic strings for the validated single-line inputs.
  const q = JSON.stringify;
  return `config-version = "2.8"\nbind = "0.0.0.0:25565"\nmotd = ${q(config.proxy.motd)}\nshow-max-players = ${routes.reduce((n, p) => n + p.maxPlayers, 0)}\nonline-mode = true\nforce-key-authentication = true\nplayer-info-forwarding-mode = "modern"\nforwarding-secret-file = "forwarding.secret"\nping-passthrough = "DISABLED"\n\n[servers]\n${routes.map((p) => `${q(p.id)} = ${q(`${addresses[p.id] ?? serverName(p.id)}:25565`)}`).join("\n")}\ntry = ${JSON.stringify([config.proxy.lobby, ...routes.map((p) => p.id).filter((id) => id !== config.proxy.lobby)])}\n\n[forced-hosts]\n${routes
    .filter((p) => p.hostname)
    .map((p) => `${q(p.hostname)} = [${q(p.id)}]`)
    .join(
      "\n",
    )}\n\n[advanced]\nfailover-on-unexpected-server-disconnect = true\n`;
}
export function renderProxyCompose(
  config: NetworkConfig,
  infra: { hostDataDir: string; network: string },
) {
  const root = path.join(path.dirname(infra.hostDataDir), "network", "proxy");
  return {
    name: "craftdeck-proxy",
    services: {
      proxy: {
        image: "itzg/mc-proxy:latest",
        container_name: proxyName,
        restart: "unless-stopped",
        logging,
        environment: {
          TYPE: "VELOCITY",
          VELOCITY_VERSION: config.proxy.version,
          MEMORY: "512m",
          HEALTH_PORT: "25565",
        },
        mem_limit: "1g",
        ports: [`${config.proxy.port}:25565`],
        networks: ["stack"],
        volumes: [`${root}/data:/server`, `${root}/config:/config:ro`],
      },
    },
    networks: { stack: { external: true, name: infra.network } },
  };
}
/** Compose interpolates dollar signs even in JSON/YAML quoted strings. */
export function composeJson(value: unknown) {
  return JSON.stringify(value, null, 2).replace(/\$/g, "$$$$");
}
