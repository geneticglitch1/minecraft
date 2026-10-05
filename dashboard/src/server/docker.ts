import http from "node:http";
import { appleInspect, applePower, appleExec, appleEnvironment, appleStats, appleLogStream, appleInfrastructure } from "./apple-container";
import { env } from "./env";
import { withServerOperation } from "./operation";

/**
 * Minimal Docker Engine API client over the unix socket (no dependencies).
 * Everything degrades to typed errors so the UI can render "docker
 * unavailable" / "container missing" states instead of crashing.
 */

export class DockerError extends Error {
  constructor(
    message: string,
    public kind: "unavailable" | "not_found" | "api" = "api",
    public statusCode?: number
  ) {
    super(message);
  }
}

type ReqOptions = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
};

function request(
  path: string,
  opts: ReqOptions = {}
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const req = http.request(
      {
        socketPath: env.dockerSocket,
        path,
        method: opts.method ?? "GET",
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) })
        );
      }
    );
    req.setTimeout(opts.timeoutMs ?? 30_000, () => req.destroy(new Error("docker API timeout")));
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT" || err.code === "ECONNREFUSED" || err.code === "EACCES") {
        reject(new DockerError(`Docker socket unavailable (${err.code})`, "unavailable"));
      } else {
        reject(new DockerError(err.message));
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function json<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  const { status, body } = await request(path, opts);
  if (status === 404) throw new DockerError(`Not found: ${path}`, "not_found", 404);
  if (status >= 400) {
    let msg = body.toString("utf8");
    try {
      msg = (JSON.parse(msg) as { message?: string }).message ?? msg;
    } catch {}
    throw new DockerError(msg, "api", status);
  }
  return body.length ? (JSON.parse(body.toString("utf8")) as T) : (undefined as T);
}

// ── container state ─────────────────────────────────────────────────────

export type ContainerState = {
  exists: boolean;
  running: boolean;
  status: string; // running | exited | restarting | created | missing
  health?: string; // healthy | unhealthy | starting
  startedAt?: string;
  exitCode?: number;
  image?: string;
};

type InspectResponse = {
  State: {
    Status: string;
    Running: boolean;
    StartedAt: string;
    ExitCode: number;
    Health?: { Status: string };
  };
  Config: { Image: string; Env: string[] };
};

export async function inspectContainer(name: string): Promise<ContainerState> {
  if (env.containerRuntime === "apple") return appleInspect(name);
  try {
    const data = await json<InspectResponse>(`/containers/${name}/json`);
    return {
      exists: true,
      running: data.State.Running,
      status: data.State.Status,
      health: data.State.Health?.Status,
      startedAt: data.State.StartedAt,
      exitCode: data.State.ExitCode,
      image: data.Config.Image,
    };
  } catch (err) {
    if (err instanceof DockerError && err.kind === "not_found") {
      return { exists: false, running: false, status: "missing" };
    }
    throw err;
  }
}

export async function containerEnv(name: string): Promise<Record<string, string>> {
  if (env.containerRuntime === "apple") return appleEnvironment(name);
  const data = await json<InspectResponse>(`/containers/${name}/json`);
  const out: Record<string, string> = {};
  for (const kv of data.Config.Env ?? []) {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

// ── power actions ───────────────────────────────────────────────────────

export type PowerAction = "start" | "stop" | "restart" | "kill";

export async function powerContainer(name: string, action: PowerAction): Promise<void> {
  return withServerOperation(() => powerContainerUnlocked(name, action));
}

async function powerContainerUnlocked(name: string, action: PowerAction): Promise<void> {
  if (env.containerRuntime === "apple") return applePower(name, action);
  const timeout = action === "stop" || action === "restart" ? "?t=90" : "";
  const { status, body } = await request(`/containers/${name}/${action}${timeout}`, {
    method: "POST",
    // stop/restart of a busy MC server can take a while; wait past t=90
    timeoutMs: 150_000,
  });
  // 204 = done, 304 = already in desired state
  if (status !== 204 && status !== 304) {
    throw new DockerError(body.toString("utf8") || `${action} failed (${status})`, "api", status);
  }
}

// ── stats ───────────────────────────────────────────────────────────────

export type ContainerStats = {
  cpuPercent: number;
  memUsed: number;
  memLimit: number;
  netRx: number; // cumulative bytes
  netTx: number;
};

type StatsResponse = {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
  };
  memory_stats: { usage?: number; stats?: { inactive_file?: number }; limit?: number };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
};

export async function containerStats(name: string): Promise<ContainerStats> {
  if (env.containerRuntime === "apple") return appleStats(name);
  // one-shot=false + stream=false makes the daemon take two samples so the
  // precpu fields are populated and CPU% is computable from a single call
  const s = await json<StatsResponse>(`/containers/${name}/stats?stream=false`);
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
  const cpus = s.cpu_stats.online_cpus ?? 1;
  const cpuPercent = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpus * 100 : 0;
  const rawUsage = s.memory_stats.usage ?? 0;
  const memUsed = rawUsage - (s.memory_stats.stats?.inactive_file ?? 0);
  let netRx = 0;
  let netTx = 0;
  for (const nic of Object.values(s.networks ?? {})) {
    netRx += nic.rx_bytes;
    netTx += nic.tx_bytes;
  }
  return { cpuPercent, memUsed, memLimit: s.memory_stats.limit ?? 0, netRx, netTx };
}

// ── logs (multiplexed stream demux) ─────────────────────────────────────

/**
 * Docker multiplexes stdout/stderr into frames: 8-byte header
 * [type, 0, 0, 0, len_be32] followed by len payload bytes.
 */
function createDemuxer(onLine: (line: string) => void) {
  let buf = Buffer.alloc(0);
  let textCarry = "";
  return (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const first = buf[0];
      // Frames start with stream type 0/1/2; if not, the container was
      // started with a TTY and the stream is raw text.
      if (first > 2) {
        textCarry += buf.toString("utf8");
        buf = Buffer.alloc(0);
        break;
      }
      const len = buf.readUInt32BE(4);
      if (buf.length < 8 + len) break;
      textCarry += buf.subarray(8, 8 + len).toString("utf8");
      buf = buf.subarray(8 + len);
    }
    let nl;
    while ((nl = textCarry.indexOf("\n")) >= 0) {
      onLine(textCarry.slice(0, nl).replace(/\r$/, ""));
      textCarry = textCarry.slice(nl + 1);
    }
  };
}

export type LogStreamHandle = { stop: () => void };

export function streamContainerLogs(
  name: string,
  opts: { tail: number; follow: boolean },
  onLine: (line: string) => void,
  onEnd?: (err?: Error) => void
): LogStreamHandle {
  if (env.containerRuntime === "apple") return appleLogStream(name, opts, onLine, onEnd);
  const req = http.request({
    socketPath: env.dockerSocket,
    path: `/containers/${name}/logs?stdout=1&stderr=1&tail=${opts.tail}&follow=${opts.follow ? 1 : 0}`,
    method: "GET",
  });
  let stopped = false;
  req.on("response", (res) => {
    if ((res.statusCode ?? 500) >= 400) {
      res.resume();
      onEnd?.(new DockerError(`logs failed (${res.statusCode})`, "api", res.statusCode));
      return;
    }
    const demux = createDemuxer(onLine);
    res.on("data", (c: Buffer) => demux(c));
    res.on("end", () => onEnd?.());
    res.on("error", (e) => onEnd?.(e as Error));
  });
  req.on("error", (e) => {
    if (!stopped) onEnd?.(e as Error);
  });
  req.end();
  return {
    stop: () => {
      stopped = true;
      req.destroy();
    },
  };
}

// ── exec ────────────────────────────────────────────────────────────────

export async function execInContainer(
  name: string,
  cmd: string[],
  timeoutMs = 15 * 60 * 1000
): Promise<{ exitCode: number; output: string }> {
  if (env.containerRuntime === "apple") return appleExec(name, cmd, timeoutMs);
  const { Id } = await json<{ Id: string }>(`/containers/${name}/exec`, {
    method: "POST",
    body: { AttachStdout: true, AttachStderr: true, Cmd: cmd },
  });

  const output = await new Promise<string>((resolve, reject) => {
    const req = http.request(
      {
        socketPath: env.dockerSocket,
        path: `/exec/${Id}/start`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let text = "";
        const demux = createDemuxer((line) => {
          text += line + "\n";
        });
        res.on("data", (c: Buffer) => demux(c));
        res.on("end", () => resolve(text));
        res.on("error", reject);
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("exec timeout")));
    req.on("error", reject);
    req.write(JSON.stringify({ Detach: false, Tty: false }));
    req.end();
  });

  const info = await json<{ ExitCode: number | null }>(`/exec/${Id}/json`);
  if (info.ExitCode === null) throw new DockerError("Container command is still running; completion is unverified");
  return { exitCode: info.ExitCode, output };
}

/** Network profiles join the primary stack's Docker network and data mount. */
export async function networkInfrastructure() {
  if (env.containerRuntime === "apple") return appleInfrastructure();
  const data = await json<{ Mounts: Array<{ Type: string; Source: string; Destination: string }>; NetworkSettings: { Networks: Record<string, unknown> } }>(`/containers/${env.mcContainer}/json`);
  const mount = data.Mounts.find(m => m.Destination === "/data" && m.Type === "bind");
  const networks = Object.keys(data.NetworkSettings.Networks).filter(n => n !== "host" && n !== "none" && n !== "bridge");
  if (!mount || networks.length !== 1) throw new Error("Network deployment requires the primary server's /data bind mount and one user-defined Docker network");
  return { hostDataDir: mount.Source, network: networks[0] };
}
