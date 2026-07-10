import { execFile } from "node:child_process";
import { env } from "./env";

/**
 * Apply configuration changes by re-running docker compose for a service.
 * The dashboard image bundles the docker CLI + compose plugin and mounts the
 * project directory, so compose picks up .env edits and recreates only what
 * changed.
 */

export function runCompose(args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      "docker",
      ["compose", "--project-directory", env.projectDir, ...args],
      { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: [stdout, stderr, err?.message].filter(Boolean).join("\n") });
      }
    );
  });
}

/** Recreate the Minecraft container so new .env values take effect. */
export function applyMcConfig(): Promise<{ ok: boolean; output: string }> {
  return runCompose(["up", "-d", "--no-deps", env.mcContainer]);
}

/** Recreate the backup sidecar (after backup schedule changes). */
export function applyBackupConfig(): Promise<{ ok: boolean; output: string }> {
  return runCompose(["up", "-d", "--no-deps", "backup"]);
}
