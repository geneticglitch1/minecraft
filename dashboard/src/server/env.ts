import path from "node:path";

/**
 * Central environment access. In production these are set by docker-compose;
 * in local dev sensible fallbacks point at ./dev-data so the app boots
 * without the container stack (integrations degrade to "offline" states).
 */
const dev = process.env.NODE_ENV !== "production";

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

export const env = {
  dev,
  managed: process.env.PANEL_MANAGED === "true",
  mcService: str("MC_SERVICE", "mc"),
  composeFile: str("COMPOSE_FILE_NAME", "docker-compose.yml"),
  restoreWorkDir: path.resolve(str("RESTORE_WORK_DIR", dev ? "./dev-data/restore" : "/restore-work")),
  restoreHelper: str("RESTORE_HELPER", "/app/restore_data.py"),
  sessionSecret: str("PANEL_SESSION_SECRET", dev ? "craftdeck-dev-secret-do-not-use" : ""),
  initialAdminPassword: str("PANEL_ADMIN_PASSWORD", dev ? "admin" : ""),

  rconHost: str("RCON_HOST", "127.0.0.1"),
  rconPort: Number(str("RCON_PORT", "25575")),
  rconPassword: str("RCON_PASSWORD", "minecraft"),

  dockerSocket: str("DOCKER_SOCKET", "/var/run/docker.sock"),
  mcContainer: str("MC_CONTAINER", "mc"),
  backupContainer: str("BACKUP_CONTAINER", "mc-backup"),

  mcDataDir: path.resolve(str("MC_DATA_DIR", dev ? "./dev-data/mc" : "/mc-data")),
  backupsDir: path.resolve(str("BACKUPS_DIR", dev ? "./dev-data/backups" : "/backups")),
  appDataDir: path.resolve(str("APP_DATA_DIR", dev ? "./dev-data/app" : "/app-data")),
  projectDir: path.resolve(str("PROJECT_DIR", dev ? ".." : "/project")),

  registrationWindowMinutes: Number(str("REGISTRATION_WINDOW_MINUTES", "2")),
  discordWebhookUrl: str("DISCORD_WEBHOOK_URL", ""),
};
