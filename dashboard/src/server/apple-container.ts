/** Apple's native macOS container CLI. The panel process must run on the Mac host. */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { atomicWrite } from "./network-config";
import type {
  ContainerState,
  ContainerStats,
  LogStreamHandle,
  PowerAction,
} from "./docker";
const exec = promisify(execFile);
export type AppleInspect = {
  configuration: {
    id: string;
    image: { reference: string };
    initProcess: { environment: string[] };
    mounts: Array<{ source: string; destination: string }>;
    resources: { memoryInBytes: number };
  };
  status: {
    state: string;
    startedDate?: string;
    networks: Array<{ ipv4Address: string; network: string }>;
  };
};
function cli() {
  if (process.platform !== "darwin")
    throw new Error(
      "Apple container control must run on the macOS host. Use scripts/apple-container-dev.sh.",
    );
  return process.env.APPLE_CONTAINER_CLI || "/opt/homebrew/bin/container";
}
export async function appleCommand(args: string[], timeout = 30_000) {
  try {
    return await exec(cli(), args, { timeout, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    // execFile's generic message includes all argv: report stderr rather than secrets/commands.
    const e = error as Error & { stderr?: string; code?: string | number };
    if (e.code === "ENOENT")
      throw new Error(
        "Apple container CLI is unavailable; check APPLE_CONTAINER_CLI",
      );
    throw new Error(
      e.stderr?.trim() ||
        `Apple container ${args[0]} failed (${e.code ?? "timeout"})`,
    );
  }
}
export async function appleInspectRaw(
  name: string,
): Promise<AppleInspect | null> {
  try {
    const r = await appleCommand(["inspect", name]);
    return (JSON.parse(r.stdout) as AppleInspect[])[0] ?? null;
  } catch (e) {
    if (
      /not found|does not exist|no such container/i.test((e as Error).message)
    )
      return null;
    throw e;
  }
}
const health = new Map<string, { time: number; value: string }>();
export async function appleInspect(name: string): Promise<ContainerState> {
  const info = await appleInspectRaw(name);
  if (!info) return { exists: false, running: false, status: "missing" };
  const running = info.status.state === "running";
  let ready: string | undefined;
  if (running && !name.endsWith("-backup")) {
    const cached = health.get(name);
    if (cached && Date.now() - cached.time < 8000) ready = cached.value;
    else {
      try {
        await appleCommand(
          [
            "exec",
            name,
            "mc-monitor",
            "status",
            "--host",
            "127.0.0.1",
            "--port",
            "25565",
          ],
          8000,
        );
        ready = "healthy";
      } catch {
        ready = "starting";
      }
      health.set(name, { time: Date.now(), value: ready });
    }
  }
  return {
    exists: true,
    running,
    status: info.status.state,
    health: ready,
    startedAt: info.status.startedDate,
    image: info.configuration.image.reference,
  };
}
export async function applePower(name: string, action: PowerAction) {
  health.delete(name);
  if (action === "restart") {
    const current = await appleInspectRaw(name);
    if (current?.status.state === "running")
      await appleCommand(["stop", "--time", "90", name], 150000);
    await appleCommand(["start", name], 120000);
  } else
    await appleCommand(
      action === "stop" ? ["stop", "--time", "90", name] : [action, name],
      150000,
    );
}
export async function appleExec(name: string, args: string[], timeout: number) {
  try {
    const r = await appleCommand(["exec", name, ...args], timeout);
    return { exitCode: 0, output: r.stdout + r.stderr };
  } catch (e) {
    return { exitCode: 1, output: (e as Error).message };
  }
}
export async function appleEnvironment(name: string) {
  const info = await appleInspectRaw(name);
  if (!info) throw new Error("Container not found");
  return Object.fromEntries(
    info.configuration.initProcess.environment.map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i), s.slice(i + 1)];
    }),
  );
}
const cpuSamples = new Map<string, { time: number; usage: number }>();
export async function appleStats(name: string): Promise<ContainerStats> {
  const result = await appleCommand([
    "stats",
    name,
    "--no-stream",
    "--format",
    "json",
  ]);
  const s = JSON.parse(result.stdout)[0] as {
    cpuUsageUsec: number;
    memoryUsageBytes: number;
    memoryLimitBytes: number;
    networkRxBytes: number;
    networkTxBytes: number;
  };
  if (!s) throw new Error("No container stats available");
  const now = Date.now();
  const prev = cpuSamples.get(name);
  cpuSamples.set(name, { time: now, usage: s.cpuUsageUsec });
  return {
    cpuPercent:
      prev && now > prev.time
        ? Math.max(
            0,
            ((s.cpuUsageUsec - prev.usage) / ((now - prev.time) * 1000)) * 100,
          )
        : 0,
    memUsed: s.memoryUsageBytes,
    memLimit: s.memoryLimitBytes,
    netRx: s.networkRxBytes,
    netTx: s.networkTxBytes,
  };
}
export function appleLogStream(
  name: string,
  opts: { tail: number; follow: boolean },
  onLine: (s: string) => void,
  onEnd?: (e?: Error) => void,
): LogStreamHandle {
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(cli(), [
      "logs",
      "-n",
      String(opts.tail),
      ...(opts.follow ? ["--follow"] : []),
      name,
    ]);
  } catch (e) {
    onEnd?.(e as Error);
    return { stop() {} };
  }
  let carry = "";
  let stopped = false;
  const receive = (chunk: Buffer) => {
    carry += chunk.toString();
    let i;
    while ((i = carry.indexOf("\n")) >= 0) {
      onLine(carry.slice(0, i));
      carry = carry.slice(i + 1);
    }
  };
  child.stdout?.on("data", receive);
  child.stderr?.on("data", receive);
  child.on("error", (e) => {
    if (!stopped) onEnd?.(e);
  });
  child.on("close", () => {
    if (!stopped) onEnd?.();
  });
  return {
    stop() {
      stopped = true;
      child.kill();
    },
  };
}
export async function appleInfrastructure() {
  await appleCommand(["system", "status"]);
  const network = process.env.APPLE_CONTAINER_NETWORK || "craftdeck";
  try {
    await appleCommand(["network", "inspect", network]);
  } catch (e) {
    if (!/not found|does not exist/i.test((e as Error).message)) throw e;
    await appleCommand(["network", "create", network]);
  }
  return { hostDataDir: env.mcDataDir, network };
}
export async function appleAddress(name: string) {
  const info = await appleInspectRaw(name);
  const address = info?.status.networks[0]?.ipv4Address?.split("/")[0];
  if (!address)
    throw new Error(`Start ${name} before applying gateway routing`);
  return address;
}
type Service = {
  image: string;
  container_name: string;
  environment: Record<string, string>;
  mem_limit?: string;
  volumes: string[];
  ports?: string[];
};
type ComposePlan = {
  services: Record<string, Service>;
  networks: { stack: { name: string } };
};
/** Translate only CraftDeck's own generated service definition, never arbitrary Compose input. */
export function appleRunArguments(
  service: Service,
  network: string,
  envFile: string,
) {
  return [
    "run",
    "-d",
    "--name",
    service.container_name,
    "--cpus",
    service.container_name.endsWith("-backup") ? "1" : "2",
    "--memory",
    (service.mem_limit ?? "512m").toUpperCase(),
    "--network",
    network,
    "--dns",
    process.env.APPLE_CONTAINER_DNS || "1.1.1.1",
    ...(service.container_name === "craftdeck-velocity"
      ? [
          "--user",
          `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        ]
      : []),
    "--env-file",
    envFile,
    ...service.volumes.flatMap((v) => ["--volume", v]),
    ...(service.ports ?? []).flatMap((p) => ["--publish", p]),
    service.image,
  ];
}
async function runService(service: Service, network: string, dir: string) {
  // Pull first so a registry failure leaves the existing container available.
  await appleCommand(["image", "pull", service.image], 15 * 60_000);
  const previous = await appleInspectRaw(service.container_name);
  if (previous) {
    if (previous.status.state === "running")
      await applePower(service.container_name, "stop");
    await appleCommand(["delete", service.container_name]);
  }
  health.delete(service.container_name);
  const file = path.join(dir, `${service.container_name}.env`);
  atomicWrite(
    file,
    Object.entries(service.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
  await appleCommand(appleRunArguments(service, network, file), 120_000);
}
export async function appleWaitReady(name: string, seconds = 600) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const info = await appleInspect(name);
    if (info.health === "healthy") return;
    if (!info.running)
      throw new Error(
        `${name} exited before Minecraft became ready; inspect its console`,
      );
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`${name} did not become ready within ${seconds} seconds`);
}
function readPlan(file: string): ComposePlan {
  // Undo Compose's escaped dollar signs before passing literal values via env-file.
  return JSON.parse(
    fs.readFileSync(file, "utf8").replace(/\$\$/g, "$"),
  ) as ComposePlan;
}
/** A stopped/started Apple VM can acquire a new IP, including after snapshots. */
export async function appleRefreshBackup(file: string) {
  const plan = readPlan(file);
  const server = plan.services.server;
  if (!server) throw new Error("Missing server deployment plan");
  await appleWaitReady(server.container_name);
  const backup = plan.services.backup;
  if (backup) {
    backup.environment.RCON_HOST = await appleAddress(server.container_name);
    await runService(backup, plan.networks.stack.name, path.dirname(file));
  }
}
export async function appleApply(file: string) {
  const plan = readPlan(file);
  const network = plan.networks.stack.name;
  const dir = path.dirname(file);
  if (plan.services.server) {
    await runService(plan.services.server, network, dir);
    await appleRefreshBackup(file);
  } else if (plan.services.proxy) {
    await runService(plan.services.proxy, network, dir);
    await appleWaitReady(plan.services.proxy.container_name, 180);
  } else throw new Error("Unsupported Apple container deployment plan");
}
