import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/server/env", () => ({
  env: {
    mcDataDir: "",
    appDataDir: "",
    projectDir: "",
    managed: false,
    rconPassword: "test-rcon",
    restoreHelper: "/helper.py",
    containerRuntime: "docker",
  },
}));
vi.mock("../src/server/docker", () => ({
  inspectContainer: vi.fn(async () => ({
    exists: true,
    running: true,
    health: "healthy",
  })),
  powerContainer: vi.fn(async () => {}),
  execInContainer: vi.fn(),
  networkInfrastructure: vi.fn(async () => ({
    hostDataDir: "/srv/data/mc",
    network: "stack",
  })),
}));
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execFile: vi.fn((...args: unknown[]) => {
    const cb = args.at(-1) as (
      err: Error | null,
      stdout: string,
      stderr: string,
    ) => void;
    cb(null, "", "");
  }),
}));
vi.mock("../src/server/apple-container", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/apple-container")>()),
  appleRefreshBackup: vi.fn(async () => {}),
  appleWaitReady: vi.fn(async () => {}),
  appleAddress: vi.fn(async () => "192.0.2.25"),
}));
import { env } from "../src/server/env";
import { execFile } from "node:child_process";
import { inspectContainer, powerContainer } from "../src/server/docker";
import { defaultProfile } from "../src/lib/network";
import {
  readNetwork,
  writeNetwork,
  validateProfile,
  profileRoot,
} from "../src/server/network-config";
import {
  deployProfile,
  snapshotProfile,
  restoreProfile,
  restartProfile,
  stopProfile,
  queueNetworkJob,
  reconcileJobs,
  networkBusy,
  assertNetworkIdle,
} from "../src/server/network";
import {
  appleRunArguments,
  appleRefreshBackup,
  appleWaitReady,
} from "../src/server/apple-container";
let root: string;
let id: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "craftdeck-ops-"));
  env.mcDataDir = path.join(root, "mc");
  env.appDataDir = path.join(root, "app");
  env.projectDir = root;
  env.managed = false;
  env.containerRuntime = "docker";
  vi.clearAllMocks();
  vi.mocked(inspectContainer).mockResolvedValue({
    exists: true,
    running: true,
    health: "healthy",
    status: "running",
  });
  const p = validateProfile({ ...defaultProfile, name: "Lobby" });
  id = p.id;
  writeNetwork({
    schema: 1,
    profiles: [p],
    proxy: { port: 25566, lobby: id, motd: "Network", version: "latest" },
    jobs: [],
  });
  fs.mkdirSync(path.join(profileRoot(id), "data", "world"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(profileRoot(id), "data", "world", "level.dat"),
    "test",
  );
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
describe("network lifecycle safety", () => {
  it("reconnects native backups and gateway routes after a restart changes the world IP", async () => {
    env.containerRuntime = "apple";
    await restartProfile(id);
    expect(powerContainer).toHaveBeenCalledWith(
      `craftdeck-${id}-backup`,
      "stop",
    );
    expect(appleRefreshBackup).toHaveBeenCalledWith(
      path.join(profileRoot(id), "compose.json"),
    );
    expect(
      fs.readFileSync(
        path.join(profileRoot("proxy"), "config", "velocity.toml"),
        "utf8",
      ),
    ).toContain("192.0.2.25:25565");
    expect(powerContainer).toHaveBeenCalledWith(
      "craftdeck-velocity",
      "restart",
    );
    expect(appleWaitReady).toHaveBeenCalledWith("craftdeck-velocity", 180);
    const backupCall =
      vi.mocked(appleRefreshBackup).mock.invocationCallOrder[0];
    const gatewayCall = vi
      .mocked(powerContainer)
      .mock.invocationCallOrder.at(-1)!;
    expect(backupCall).toBeLessThan(gatewayCall);
  });
  it("restores native connections even when snapshot creation fails", async () => {
    env.containerRuntime = "apple";
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      (args.at(-1) as (e: Error) => void)(new Error("disk full"));
      return {} as ReturnType<typeof execFile>;
    });
    await expect(snapshotProfile(id, () => {})).rejects.toThrow("disk full");
    expect(appleRefreshBackup).toHaveBeenCalledWith(
      path.join(profileRoot(id), "compose.json"),
    );
    expect(powerContainer).toHaveBeenCalledWith(
      "craftdeck-velocity",
      "restart",
    );
  });
  it("removes a stopped native world from routes instead of retaining its reusable IP", async () => {
    env.containerRuntime = "apple";
    const config = readNetwork();
    const other = validateProfile({ ...defaultProfile, name: "Other world" });
    config.profiles.push(other);
    writeNetwork(config);
    vi.mocked(inspectContainer).mockImplementation(async (name) => ({
      exists: true,
      running: name !== `craftdeck-${id}`,
      status: "running",
      health: "healthy",
    }));
    await stopProfile(id);
    const routes = fs.readFileSync(
      path.join(profileRoot("proxy"), "config", "velocity.toml"),
      "utf8",
    );
    expect(routes).not.toContain(id);
    expect(routes).toContain(other.id);
    expect(readNetwork().proxy.lobby).toBe(id);
  });
  it("stops the native gateway when its last world is stopped", async () => {
    env.containerRuntime = "apple";
    vi.mocked(inspectContainer).mockImplementation(async (name) => ({
      exists: true,
      running: name !== `craftdeck-${id}`,
      status: "running",
      health: "healthy",
    }));
    expect(await stopProfile(id)).toContain("Apply routing");
    expect(powerContainer).toHaveBeenCalledWith("craftdeck-velocity", "stop");
    expect(powerContainer).not.toHaveBeenCalledWith(
      "craftdeck-velocity",
      "restart",
    );
  });
  it("backup failure cancels deployment and resumes original writers", async () => {
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      (args.at(-1) as (e: Error) => void)(new Error("disk full"));
      return {} as ReturnType<typeof execFile>;
    });
    await expect(deployProfile(id, () => {})).rejects.toThrow("disk full");
    expect(vi.mocked(execFile).mock.calls.some((c) => c[0] === "docker")).toBe(
      false,
    );
    expect(powerContainer).toHaveBeenCalledWith(`craftdeck-${id}`, "start");
    expect(powerContainer).toHaveBeenCalledWith(
      `craftdeck-${id}-backup`,
      "start",
    );
    expect(fs.existsSync(path.join(profileRoot(id), "compose.json"))).toBe(
      false,
    );
  });
  it("does not stop or change a world when map compatibility resolution fails", async () => {
    const c = readNetwork();
    c.profiles[0].map = "bluemap";
    writeNetwork(c);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    await expect(deployProfile(id, () => {})).rejects.toThrow("No stable");
    expect(powerContainer).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });
  it("does not publish an archive until verification succeeds", async () => {
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const argv = args[1] as string[];
      fs.writeFileSync(argv[1], "partial");
      (args.at(-1) as (e: null, stdout: string, stderr: string) => void)(
        null,
        "",
        "",
      );
      return {} as ReturnType<typeof execFile>;
    });
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      (args.at(-1) as (e: Error) => void)(new Error("archive invalid"));
      return {} as ReturnType<typeof execFile>;
    });
    await expect(snapshotProfile(id, () => {})).rejects.toThrow(
      "archive invalid",
    );
    expect(
      fs
        .readdirSync(path.join(profileRoot(id), "backups"))
        .every((n) => n.endsWith(".partial")),
    ).toBe(true);
  });
  it("validates restore selection before stopping writers", async () => {
    await expect(restoreProfile(id, "../../bad.tgz", () => {})).rejects.toThrow(
      "Backup not found",
    );
    expect(powerContainer).not.toHaveBeenCalled();
  });
  it("marks orphan jobs failed without retrying destructive operations", () => {
    const c = readNetwork();
    c.jobs = [
      {
        id: "old",
        profileId: id,
        action: "restore",
        state: "running",
        message: "",
        startedAt: 1,
      },
    ];
    writeNetwork(c);
    expect(reconcileJobs(c).jobs[0].state).toBe("failed");
    expect(powerContainer).not.toHaveBeenCalled();
  });
  it("blocks conflicting edits and persists job failures without secrets", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const job = queueNetworkJob(id, "test", async () => {
      await gate;
      throw new Error(`oops ${env.rconPassword}`);
    });
    expect(networkBusy()).toBe(true);
    expect(() => assertNetworkIdle()).toThrow("Wait");
    expect(() => queueNetworkJob(id, "second", async () => "ok")).toThrow(
      "Wait",
    );
    release();
    await vi.waitFor(() => expect(networkBusy()).toBe(false));
    const saved = readNetwork().jobs.find((j) => j.id === job.id)!;
    expect(saved.state).toBe("failed");
    expect(saved.message).toBe("oops [redacted]");
  });
  it("managed deployments reject jobs before changing persistent state", () => {
    env.managed = true;
    expect(() => queueNetworkJob(id, "start", async () => "ok")).toThrow(
      "managed by Komodo",
    );
    expect(readNetwork().jobs).toEqual([]);
  });
  it("uses the native Apple CLI with separate arguments and a credential file", () => {
    const args = appleRunArguments(
      {
        image: "itzg/minecraft-server:java21",
        container_name: "craftdeck-lobby",
        environment: { RCON_PASSWORD: "never-in-argv" },
        mem_limit: "3g",
        volumes: ["/path with spaces/data:/data"],
        ports: ["127.0.0.1:8101:8100"],
      },
      "craftdeck",
      "/private/profile.env",
    );
    expect(args).toContain("/path with spaces/data:/data");
    expect(args).toContain("3G");
    expect(args).not.toContain("never-in-argv");
    expect(args).not.toContain("docker");
    expect(args).toContain("--env-file");
  });
});
