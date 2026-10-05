import { execFile } from "node:child_process";
import { env } from "./env";
import { assertDeploymentEditable } from "./managed";
import { withServerOperation } from "./operation";
import path from "node:path";

/**
 * Apply configuration changes by re-running docker compose for a service.
 * The dashboard image bundles the docker CLI + compose plugin and mounts the
 * project directory, so compose picks up .env edits and recreates only what
 * changed.
 */

export function runCompose(args: string[]): Promise<{ ok: boolean; output: string }> {
  assertDeploymentEditable();
  if (env.containerRuntime === "apple") throw new Error("Primary Compose configuration applies on the production Docker host. Use Worlds & Network for native Apple-container profiles.");
  return withServerOperation(() => new Promise((resolve) => {
    execFile(
      "docker",
      ["compose", "--project-directory", env.projectDir, "-f", path.join(env.projectDir, env.composeFile), ...args],
      { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: [stdout, stderr, err?.message].filter(Boolean).join("\n") });
      }
    );
  }));
}

/** Recreate the Minecraft container so new .env values take effect. */
export function applyMcConfig(): Promise<{ ok: boolean; output: string }> {
  return runCompose(["up", "-d", "--no-deps", env.mcService]);
}

/** Recreate the backup sidecar (after backup schedule changes). */
export function applyBackupConfig(): Promise<{ ok: boolean; output: string }> {
  return runCompose(["up", "-d", "--no-deps", "backup"]);
}
