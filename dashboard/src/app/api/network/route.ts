import { NextRequest } from "next/server";
import { ok, fail, handle, readJson } from "@/server/api";
import { env } from "@/server/env";
import { readEnvFile } from "@/server/envfile";
import { assertDeploymentEditable } from "@/server/managed";
import { inspectContainer, powerContainer } from "@/server/docker";
import {
  readNetwork,
  writeNetwork,
  validateProfile,
  validateProxy,
  profileById,
  NetworkInputError,
} from "@/server/network-config";
import { serverName, proxyName } from "@/server/network-render";
import {
  networkBusy,
  assertNetworkIdle,
  reconcileJobs,
  checkPorts,
  queueNetworkJob,
  deployProfile,
  deployProxy,
  stopProfile,
  restartProfile,
  snapshotProfile,
  restoreProfile,
  profileConsole,
  profileLogs,
  profileBackups,
} from "@/server/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function networkHandle(fn: () => Promise<ReturnType<typeof ok>>) {
  return handle(async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof NetworkInputError) return fail(e.message, 400);
      throw e;
    }
  });
}
export async function GET(req: NextRequest) {
  return networkHandle(async () => {
    const config = reconcileJobs(readNetwork());
    const id = req.nextUrl.searchParams.get("id");
    const kind = req.nextUrl.searchParams.get("kind");
    if (id) {
      profileById(config, id);
      if (kind === "logs") return ok(await profileLogs(id));
      if (kind === "backups") return ok(profileBackups(id));
    }
    const entries = await Promise.all(
      [
        ...config.profiles.map((p) => [p.id, serverName(p.id)]),
        ["proxy", proxyName],
      ].map(async ([id, name]) => {
        try {
          return [id, await inspectContainer(name)] as const;
        } catch (e) {
          return [
            id,
            {
              exists: false,
              running: false,
              status: "unavailable",
              error: (e as Error).message,
            },
          ] as const;
        }
      }),
    );
    return ok({
      ...config,
      managed: env.managed,
      runtime: env.containerRuntime,
      states: Object.fromEntries(entries),
      primaryPort: Number(readEnvFile().MC_PORT || 25565),
      busy: networkBusy(),
    });
  });
}
export async function POST(req: NextRequest) {
  return networkHandle(async () => {
    assertDeploymentEditable();
    assertNetworkIdle();
    const body = await readJson<Record<string, unknown>>(req);
    if (!body || typeof body !== "object") return fail("Invalid request");
    const config = readNetwork();
    if (body.op === "save") {
      const existing = body.id ? profileById(config, body.id) : undefined;
      if (!existing && config.profiles.length >= 32)
        return fail("Maximum 32 profiles per panel");
      const p = validateProfile(body.profile, existing);
      config.profiles = [...config.profiles.filter((s) => s.id !== p.id), p];
      if (!config.proxy.lobby && p.route === "proxy") config.proxy.lobby = p.id;
      checkPorts(config);
      writeNetwork(config);
      return ok(p);
    }
    if (body.op === "proxy-save") {
      config.proxy = validateProxy(body.proxy, config);
      checkPorts(config);
      writeNetwork(config);
      return ok(config.proxy);
    }
    if (body.op === "proxy-apply") {
      if (body.confirm !== "apply proxy")
        return fail(
          "Confirm applying the proxy; existing connections will close",
        );
      return ok(queueNetworkJob("proxy", "apply proxy", deployProxy));
    }
    if (body.op === "proxy-stop") {
      if (body.confirm !== "stop proxy")
        return fail("Confirm stopping the gateway");
      return ok(
        queueNetworkJob("proxy", "stop proxy", async () => {
          if ((await inspectContainer(proxyName)).running)
            await powerContainer(proxyName, "stop");
          return "Gateway stopped. World servers and their data remain available.";
        }),
      );
    }
    const p = profileById(config, body.id);
    if (body.op === "command")
      return ok(await profileConsole(p.id, body.command as string));
    if (body.confirm !== p.name)
      return fail(`Confirm by entering the server name: ${p.name}`);
    switch (body.op) {
      case "deploy":
        return ok(
          queueNetworkJob(p.id, "deploy", (progress) =>
            deployProfile(p.id, progress),
          ),
        );
      case "stop":
        return ok(queueNetworkJob(p.id, "stop", () => stopProfile(p.id)));
      case "restart":
        return ok(queueNetworkJob(p.id, "restart", () => restartProfile(p.id)));
      case "snapshot":
        return ok(
          queueNetworkJob(p.id, "snapshot", (progress) =>
            snapshotProfile(p.id, progress),
          ),
        );
      case "restore": {
        if (typeof body.backup !== "string") return fail("Choose a backup");
        const name = body.backup;
        return ok(
          queueNetworkJob(p.id, "restore", (progress) =>
            restoreProfile(p.id, name, progress),
          ),
        );
      }
      default:
        return fail("Unknown network action");
    }
  });
}
