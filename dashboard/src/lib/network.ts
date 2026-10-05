/** Shared, serializable network configuration. No credentials belong here. */
export const LOADERS = [
  "PAPER",
  "FOLIA",
  "FABRIC",
  "FORGE",
  "NEOFORGE",
  "QUILT",
  "VANILLA",
  "MODRINTH",
] as const;
export type Loader = (typeof LOADERS)[number];
export type WorldProfile = {
  id: string;
  name: string;
  version: string;
  loader: Loader;
  java: "8" | "17" | "21" | "25";
  seed: string;
  memory: number;
  maxPlayers: number;
  difficulty: string;
  mode: string;
  viewDistance: number;
  simulationDistance: number;
  pvp: boolean;
  hardcore: boolean;
  route: "proxy" | "direct";
  port: number;
  hostname: string;
  mods: string;
  modpack: string;
  modpackVersion: string;
  loaderVersion: string;
  map: "none" | "bluemap" | "dynmap";
  mapPort: number;
  mapUrl: string;
  resourcePack: string;
  resourcePackSha1: string;
  resourcePackRequired: boolean;
  resourcePackPrompt: string;
  whitelist: string;
  backupHours: number;
  retentionDays: number;
  createdAt: number;
};
export type ProxySettings = {
  port: number;
  lobby: string;
  motd: string;
  version: string;
};
export type NetworkJob = {
  id: string;
  profileId: string;
  action: string;
  state: "queued" | "running" | "succeeded" | "failed";
  message: string;
  startedAt: number;
  finishedAt?: number;
};
export type NetworkConfig = {
  schema: 1;
  profiles: WorldProfile[];
  proxy: ProxySettings;
  jobs: NetworkJob[];
};
export type RuntimeState = {
  exists: boolean;
  running: boolean;
  status: string;
  health?: string;
  error?: string;
};
export type NetworkView = NetworkConfig & {
  managed: boolean;
  runtime: string;
  states: Record<string, RuntimeState>;
  primaryPort: number;
  busy: boolean;
};
export const defaultProfile: Omit<WorldProfile, "id" | "createdAt"> = {
  name: "",
  version: "1.21.11",
  loader: "PAPER",
  java: "21",
  seed: "",
  memory: 4,
  maxPlayers: 20,
  difficulty: "normal",
  mode: "survival",
  viewDistance: 10,
  simulationDistance: 6,
  pvp: true,
  hardcore: false,
  route: "proxy",
  port: 25570,
  hostname: "",
  mods: "",
  modpack: "",
  modpackVersion: "",
  loaderVersion: "",
  map: "none",
  mapPort: 8101,
  mapUrl: "",
  resourcePack: "",
  resourcePackSha1: "",
  resourcePackRequired: false,
  resourcePackPrompt: "",
  whitelist: "",
  backupHours: 24,
  retentionDays: 7,
};
export const proxyCompatible = (loader: Loader) =>
  loader === "PAPER" || loader === "FOLIA";
