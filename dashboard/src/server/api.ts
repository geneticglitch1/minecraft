import { NextResponse } from "next/server";
import { DockerError } from "./docker";
import { RconError } from "./rcon";
import { ManagedDeploymentError } from "./managed";

/**
 * Small helpers for route handlers. Authentication is enforced globally in
 * middleware.ts; these standardize success/error payloads and translate
 * infrastructure failures into friendly 503s.
 */

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function handle(fn: () => Promise<NextResponse> | NextResponse) {
  return (async () => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ManagedDeploymentError) return fail(err.message, 409);
      if (err instanceof DockerError && err.kind === "unavailable") {
        return fail("Docker is unreachable from the panel", 503);
      }
      if (err instanceof DockerError && err.kind === "not_found") {
        return fail("Container not found — is the stack deployed?", 503);
      }
      if (err instanceof RconError) {
        return fail(
          err.kind === "auth"
            ? "RCON authentication failed — check RCON_PASSWORD"
            : "Server console unreachable (is the server running?)",
          503
        );
      }
      return fail((err as Error).message || "Internal error", 500);
    }
  })();
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}
