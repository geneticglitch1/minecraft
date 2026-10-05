import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import YAML from "yaml";
import {
  appleApply,
  appleAddress,
  appleCommand,
  appleRefreshBackup,
  appleWaitReady,
} from "./apple-container";
import { env } from "./env";
import { readEnvFile } from "./envfile";
import {
  inspectContainer,
  powerContainer,
  execInContainer,
  networkInfrastructure,
} from "./docker";
import { withServerOperation } from "./operation";
import { assertDeploymentEditable } from "./managed";
import {
  atomicWrite,
  readNetwork,
  writeNetwork,
  profileById,
  profileRoot,
  validatePorts,
  NetworkInputError,
} from "./network-config";
import {
  serverName,
  backupName,
  proxyName,
  renderProfileCompose,
  renderProxyCompose,
  renderVelocity,
  composeJson,
} from "./network-render";
import type { NetworkConfig, NetworkJob, WorldProfile } from "@/lib/network";
const exec = promisify(execFile);
const globalJobs = globalThis as unknown as { __networkJobs?: Set<string> };
const runningJobs = (globalJobs.__networkJobs ??= new Set<string>());
export const networkBusy = () => runningJobs.size > 0;
export function assertNetworkIdle() {
  if (networkBusy())
    throw new NetworkInputError(
      "Wait for the current network operation to finish",
    );
}
export function checkPorts(config: NetworkConfig) {
  const values = readEnvFile();
  validatePorts(
    config,
    Number(values.MC_PORT || 25565),
    Number(values.DASHBOARD_PORT || 8080),
  );
}
export function reconcileJobs(config: NetworkConfig) {
  let changed = false;
  for (const job of config.jobs)
    if (["queued", "running"].includes(job.state) && !runningJobs.has(job.id)) {
      job.state = "failed";
      job.message =
        "Panel restarted during this operation. Inspect server status and logs before retrying.";
      job.finishedAt = Date.now();
      changed = true;
    }
  if (changed) writeNetwork(config);
  return config;
}
function redact(message: string) {
  const secrets = [env.rconPassword];
  const secretFile = path.join(
    profileRoot("proxy"),
    "config",
    "forwarding.secret",
  );
  if (fs.existsSync(secretFile))
    secrets.push(fs.readFileSync(secretFile, "utf8").trim());
  for (const value of secrets.filter(Boolean))
    message = message.split(value).join("[redacted]");
  return message.slice(-2500);
}
function updateJob(id: string, changes: Partial<NetworkJob>) {
  const config = readNetwork();
  const job = config.jobs.find((j) => j.id === id);
  if (job) {
    Object.assign(job, changes);
    writeNetwork(config);
  }
}
export function queueNetworkJob(
  profileId: string,
  action: string,
  operation: (progress: (message: string) => void) => Promise<string>,
) {
  assertDeploymentEditable();
  assertNetworkIdle();
  const config = readNetwork();
  const job: NetworkJob = {
    id: randomUUID(),
    profileId,
    action,
    state: "queued",
    message: "Waiting for server operations",
    startedAt: Date.now(),
  };
  config.jobs = [job, ...config.jobs].slice(0, 40);
  writeNetwork(config);
  runningJobs.add(job.id);
  void withServerOperation(async () => {
    try {
      updateJob(job.id, { state: "running" });
      const result = await operation((message) =>
        updateJob(job.id, { message }),
      );
      updateJob(job.id, {
        state: "succeeded",
        message: result,
        finishedAt: Date.now(),
      });
    } catch (e) {
      try {
        updateJob(job.id, {
          state: "failed",
          message: redact((e as Error).message),
          finishedAt: Date.now(),
        });
      } catch {
        // A full/unwritable registry must not leave the process locked forever.
        // The next registry read reconciles this unfinished job as interrupted.
        console.error("[craftdeck] Could not persist network operation status");
      }
    } finally {
      runningJobs.delete(job.id);
    }
  });
  return job;
}
async function compose(file: string, args: string[]) {
  if (env.containerRuntime === "apple") return appleApply(file);
  try {
    await exec(
      "docker",
      [
        "compose",
        "--project-directory",
        path.dirname(file),
        "-f",
        file,
        ...args,
      ],
      { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 },
    );
  } catch (e) {
    const err = e as Error & { stderr?: string };
    throw new Error(redact(err.stderr || err.message));
  }
}
function secret() {
  const file = path.join(profileRoot("proxy"), "config", "forwarding.secret");
  if (!fs.existsSync(file))
    atomicWrite(file, randomBytes(32).toString("hex"), 0o644);
  return fs.readFileSync(file, "utf8").trim();
}
async function resolveMap(p: WorldProfile) {
  if (p.map === "none") return "";
  const loader = p.loader.toLowerCase();
  const params = new URLSearchParams({
    loaders: JSON.stringify([loader]),
    game_versions: JSON.stringify([p.version]),
  });
  const res = await fetch(
    `https://api.modrinth.com/v2/project/${p.map}/version?${params}`,
    {
      headers: { "User-Agent": "CraftDeck/1.0" },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok)
    throw new Error(
      `Could not resolve ${p.map} (${res.status}); choose another map or install a compatible release manually`,
    );
  const versions = (await res.json()) as Array<{
    id: string;
    version_type: string;
  }>;
  const version = versions.find((v) => v.version_type === "release");
  if (!version)
    throw new Error(
      `No stable ${p.map} build advertises ${p.loader} ${p.version} support. No server files were changed.`,
    );
  return `${p.map}:${version.id}`;
}
async function validatePack(p: WorldProfile) {
  if (p.loader !== "MODRINTH") return;
  const res = await fetch(
    `https://api.modrinth.com/v2/project/${encodeURIComponent(p.modpack)}/version/${encodeURIComponent(p.modpackVersion)}`,
    {
      headers: { "User-Agent": "CraftDeck/1.0" },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error("Modrinth pack version could not be resolved");
  const version = (await res.json()) as { game_versions: string[] };
  if (!version.game_versions.includes(p.version))
    throw new Error(
      "The pack version does not support the selected Minecraft version",
    );
}
function prepareForwarding(p: WorldProfile) {
  if (p.route !== "proxy") return;
  const file = path.join(
    profileRoot(p.id),
    "data",
    "config",
    "paper-global.yml",
  );
  const doc = fs.existsSync(file)
    ? YAML.parseDocument(fs.readFileSync(file, "utf8"))
    : new YAML.Document({});
  if (doc.errors.length)
    throw new Error(
      "Could not parse paper-global.yml; repair it before deploying",
    );
  doc.setIn(["proxies", "velocity", "enabled"], true);
  doc.setIn(["proxies", "velocity", "online-mode"], true);
  doc.setIn(["proxies", "velocity", "secret"], secret());
  atomicWrite(file, doc.toString(), 0o644);
  try {
    fs.chownSync(file, 1000, 1000);
  } catch {}
}
export async function deployProfile(id: string, progress: (s: string) => void) {
  const config = readNetwork();
  checkPorts(config);
  const p = profileById(config, id);
  progress("Checking loader, map and container runtime");
  await validatePack(p);
  const mapProject = await resolveMap(p);
  const infra = await networkInfrastructure();
  const root = profileRoot(id);
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "backups"), { recursive: true });
  const state = await inspectContainer(serverName(id));
  if (
    state.running ||
    fs.existsSync(path.join(root, "data", "world", "level.dat"))
  ) {
    progress("Taking a verified backup before applying changes");
    await snapshotProfile(id, progress);
  }
  const backup = await inspectContainer(backupName(id));
  if (backup.running) await powerContainer(backupName(id), "stop");
  if ((await inspectContainer(serverName(id))).running)
    await powerContainer(serverName(id), "stop");
  prepareForwarding(p);
  const file = path.join(root, "compose.json");
  atomicWrite(
    file,
    composeJson(renderProfileCompose(p, infra, env.rconPassword, mapProject)),
  );
  progress(
    "Downloading runtime and starting server; first world generation can take several minutes",
  );
  await compose(file, ["up", "-d", "--wait", "--wait-timeout", "600"]);
  const ready = await inspectContainer(serverName(id));
  if (ready.health !== "healthy")
    throw new Error(
      "Container started but Minecraft readiness is unverified; check its console",
    );
  const routing = await refreshAppleGateway();
  return `${p.name} is healthy. ${routing || (p.route === "proxy" ? "Apply proxy routing to make it available through the network." : `Connect on port ${p.port}.`)}`;
}
/** Native VM addresses are ephemeral. Refresh only a gateway the user has started. */
async function refreshAppleGateway() {
  if (
    env.containerRuntime !== "apple" ||
    !(await inspectContainer(proxyName)).running
  )
    return "";
  const config = readNetwork();
  const addresses: Record<string, string> = {};
  const active = [];
  for (const p of config.profiles.filter((p) => p.route === "proxy")) {
    const state = await inspectContainer(serverName(p.id));
    if (state.running && state.health === "healthy") {
      addresses[p.id] = await appleAddress(serverName(p.id));
      active.push(p);
    }
  }
  if (!active.length) {
    await powerContainer(proxyName, "stop");
    return "No routed worlds are ready; gateway stopped. Apply routing after starting a world.";
  }
  const routed = {
    ...config,
    profiles: active,
    proxy: {
      ...config.proxy,
      lobby: active.some((p) => p.id === config.proxy.lobby)
        ? config.proxy.lobby
        : active[0].id,
    },
  };
  const file = path.join(profileRoot("proxy"), "config", "velocity.toml");
  const rendered = renderVelocity(routed, addresses);
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === rendered)
    return "Gateway routes are current.";
  atomicWrite(file, rendered, 0o644);
  await powerContainer(proxyName, "restart");
  await appleWaitReady(proxyName, 180);
  return "Gateway restarted with current world addresses; players can reconnect.";
}
export async function deployProxy(progress: (s: string) => void) {
  const config = readNetwork();
  checkPorts(config);
  if (!config.proxy.lobby)
    throw new NetworkInputError("Choose and save a lobby first");
  const lobby = profileById(config, config.proxy.lobby);
  if (lobby.route !== "proxy")
    throw new NetworkInputError("Lobby must be a proxy profile");
  const state = await inspectContainer(serverName(lobby.id));
  if (!state.running || state.health !== "healthy")
    throw new NetworkInputError(
      "Start the lobby and wait until healthy before applying the proxy",
    );
  const infra = await networkInfrastructure();
  secret();
  const root = profileRoot("proxy");
  const configFile = path.join(root, "config", "velocity.toml");
  if (fs.existsSync(configFile))
    fs.copyFileSync(configFile, `${configFile}.previous`);
  const addresses: Record<string, string> = {};
  if (env.containerRuntime === "apple") {
    for (const p of config.profiles.filter((p) => p.route === "proxy"))
      addresses[p.id] = await appleAddress(serverName(p.id));
  }
  atomicWrite(configFile, renderVelocity(config, addresses), 0o644);
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  const file = path.join(root, "compose.json");
  atomicWrite(file, composeJson(renderProxyCompose(config, infra)));
  progress("Applying Velocity routing; connected players will reconnect");
  await compose(file, [
    "up",
    "-d",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "180",
  ]);
  return `Velocity is ready on port ${config.proxy.port}; lobby: ${lobby.name}`;
}
export async function stopProfile(id: string) {
  profileById(readNetwork(), id);
  if ((await inspectContainer(backupName(id))).running)
    await powerContainer(backupName(id), "stop");
  const state = await inspectContainer(serverName(id));
  if (state.running) await powerContainer(serverName(id), "stop");
  const routing = await refreshAppleGateway();
  return `Server and backup writer stopped; all world files retained. ${routing}`.trim();
}
export async function restartProfile(id: string) {
  profileById(readNetwork(), id);
  if (
    env.containerRuntime === "apple" &&
    (await inspectContainer(backupName(id))).running
  )
    await powerContainer(backupName(id), "stop");
  await powerContainer(serverName(id), "restart");
  if (env.containerRuntime === "apple") {
    await appleRefreshBackup(path.join(profileRoot(id), "compose.json"));
    const routing = await refreshAppleGateway();
    return `Server is healthy; backup connection refreshed. ${routing}`.trim();
  }
  const backup = await inspectContainer(backupName(id));
  if (backup.exists && !backup.running)
    await powerContainer(backupName(id), "start");
  return "Restart requested; watch the health indicator for readiness";
}
export function profileBackups(id: string) {
  profileById(readNetwork(), id);
  const dir = path.join(profileRoot(id), "backups");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => /^[\w.-]+\.(tgz|tar\.gz)$/.test(n))
    .map((name) => ({
      name,
      size: fs.statSync(path.join(dir, name)).size,
      mtime: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}
export async function snapshotProfile(
  id: string,
  progress: (s: string) => void,
) {
  profileById(readNetwork(), id);
  const root = profileRoot(id);
  const data = path.join(root, "data");
  const server = await inspectContainer(serverName(id));
  const backup = await inspectContainer(backupName(id));
  progress("Stopping writers for a consistent world snapshot");
  if (backup.running) await powerContainer(backupName(id), "stop");
  if (server.running) await powerContainer(serverName(id), "stop");
  try {
    fs.mkdirSync(path.join(root, "backups"), { recursive: true });
    const name = `snapshot-${Date.now()}.tgz`;
    const file = path.join(root, "backups", name);
    await exec("tar", ["-czf", `${file}.partial`, "-C", data, "."], {
      timeout: 30 * 60_000,
    });
    await exec(
      "python3",
      [env.restoreHelper, "verify", "--archive", `${file}.partial`],
      { timeout: 30 * 60_000 },
    );
    fs.renameSync(`${file}.partial`, file);
    return `Verified snapshot: ${name}`;
  } finally {
    if (server.running) await powerContainer(serverName(id), "start");
    if (env.containerRuntime === "apple") {
      if (server.running) {
        progress(
          "Waiting for world readiness and refreshing native container connections",
        );
        if (backup.running)
          await appleRefreshBackup(path.join(root, "compose.json"));
        else await appleWaitReady(serverName(id));
      }
      await refreshAppleGateway();
    } else if (backup.running) await powerContainer(backupName(id), "start");
  }
}
export async function restoreProfile(
  id: string,
  name: string,
  progress: (s: string) => void,
) {
  if (!profileBackups(id).some((b) => b.name === name))
    throw new NetworkInputError("Backup not found");
  const root = profileRoot(id);
  const archive = path.join(root, "backups", name);
  await exec("python3", [env.restoreHelper, "verify", "--archive", archive], {
    timeout: 30 * 60_000,
  });
  await stopProfile(id);
  progress(
    "Restoring verified archive; previous data is retained in the recovery directory",
  );
  await exec(
    "python3",
    [
      env.restoreHelper,
      "restore",
      "--archive",
      archive,
      "--data",
      path.join(root, "data"),
      "--work",
      path.join(root, "recovery"),
    ],
    { timeout: 30 * 60_000 },
  );
  return "Restored. Server remains stopped; inspect files and deploy when ready.";
}
export async function profileConsole(id: string, command: string) {
  profileById(readNetwork(), id);
  if (
    typeof command !== "string" ||
    !command.trim() ||
    command.length > 2000 ||
    /[\r\n\0]/.test(command)
  )
    throw new NetworkInputError("Enter one console command");
  const result = await execInContainer(
    serverName(id),
    ["rcon-cli", command.trim().replace(/^\//, "")],
    20000,
  );
  if (result.exitCode)
    throw new Error(result.output || "Console command failed");
  return result.output;
}
export async function profileLogs(id: string) {
  profileById(readNetwork(), id);
  const result =
    env.containerRuntime === "apple"
      ? await appleCommand(["logs", "-n", "160", serverName(id)], 15000)
      : await exec("docker", ["logs", "--tail", "160", serverName(id)], {
          timeout: 15000,
          maxBuffer: 512 * 1024,
        });
  return redactLogs(`${result.stdout}\n${result.stderr}`);
}
function redactLogs(s: string) {
  return s.split(env.rconPassword).join("[redacted]").slice(-32000);
}
export { proxyName };
