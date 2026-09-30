import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { assertDeploymentEditable } from "./managed";

/**
 * Read/write the project .env file while preserving comments and ordering.
 * This file is the single source of truth for server configuration
 * (MC version, memory, mod list, backup schedule, ...).
 */

export function envFilePath(): string {
  return path.join(env.projectDir, ".env");
}

export function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = fs.readFileSync(envFilePath(), "utf8");
  } catch {
    return env.managed ? Object.fromEntries(EDITABLE_ENV_KEYS.map((key) => [key, process.env[key] ?? ""])) : out;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  if (env.managed) {
    for (const key of EDITABLE_ENV_KEYS) out[key] = process.env[key] ?? out[key] ?? "";
  }
  return out;
}

export function writeEnvFile(updates: Record<string, string>): void {
  assertDeploymentEditable();
  const file = envFilePath();
  let lines: string[];
  try {
    lines = fs.readFileSync(file, "utf8").split("\n");
  } catch {
    lines = [];
  }
  const remaining = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && remaining.has(m[1])) {
      const value = remaining.get(m[1])!;
      remaining.delete(m[1]);
      return `${m[1]}=${value}`;
    }
    return line;
  });
  for (const [key, value] of remaining) next.push(`${key}=${value}`);
  fs.writeFileSync(file, next.join("\n"));
}

/** Keys the config UI is allowed to edit (guards against arbitrary writes). */
export const EDITABLE_ENV_KEYS = [
  "MC_VERSION",
  "SERVER_TYPE",
  "MC_MEMORY",
  "MC_CONTAINER_MEM_LIMIT",
  "MC_PORT",
  "MC_MOTD",
  "MC_DIFFICULTY",
  "MC_MAX_PLAYERS",
  "MC_VIEW_DISTANCE",
  "MC_SIMULATION_DISTANCE",
  "MC_SEED",
  "MODRINTH_PROJECTS",
  "MODRINTH_MODPACK",
  "BACKUP_INTERVAL",
  "BACKUP_RETENTION_DAYS",
  "REGISTRATION_WINDOW_MINUTES",
  "DISCORD_WEBHOOK_URL",
  "TZ",
] as const;
