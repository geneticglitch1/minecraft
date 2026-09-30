import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../src/server/env", () => ({ env: { managed: false, backupsDir: "/missing-test-backups", backupContainer: "backup", projectDir: "/missing-project" } }));
vi.mock("../src/server/docker", () => ({
  execInContainer: vi.fn(async () => ({ exitCode: 1, output: "backup disk full" })),
  powerContainer: vi.fn(), inspectContainer: vi.fn(), DockerError: class extends Error {},
}));
vi.mock("../src/server/db", () => ({ logActivity: vi.fn() }));
vi.mock("../src/server/notify", () => ({ notify: vi.fn() }));
vi.mock("../src/server/compose", () => ({ applyMcConfig: vi.fn(), applyBackupConfig: vi.fn() }));
import { env } from "../src/server/env";
import { safetyBackup } from "../src/server/backups";
import { execInContainer } from "../src/server/docker";
import { applyMcConfig } from "../src/server/compose";
import { writeEnvFile } from "../src/server/envfile";
import { writeTextFile, writeBinaryFile, deletePath, makeDir } from "../src/server/files";
import { POST } from "../src/app/api/config/apply/route";
import { POST as applyMods } from "../src/app/api/mods/apply/route";

beforeEach(() => { env.managed = false; vi.clearAllMocks(); });
describe("required backups and managed deployment", () => {
  it("does not swallow a failed safety backup", async () => {
    await expect(safetyBackup("upgrade")).rejects.toThrow("disk full");
  });
  it("aborts a config apply even when a client asks to skip backup", async () => {
    const response = await POST(new NextRequest("http://localhost/api/config/apply", {
      method: "POST", body: JSON.stringify({ backupFirst: false }),
    }));
    expect(response.status).toBe(500);
    expect(applyMcConfig).not.toHaveBeenCalled();
  });
  it("also aborts mod apply after a failed backup", async () => {
    expect((await applyMods()).status).toBe(500);
    expect(applyMcConfig).not.toHaveBeenCalled();
  });
  it("rejects managed config apply before executing anything", async () => {
    env.managed = true;
    const response = await POST(new NextRequest("http://localhost/api/config/apply", { method: "POST", body: "{}" }));
    expect(response.status).toBe(409);
    expect(execInContainer).not.toHaveBeenCalled();
    expect(applyMcConfig).not.toHaveBeenCalled();
  });
  it("guards direct config and file mutation helpers", () => {
    env.managed = true;
    for (const change of [
      () => writeEnvFile({ MC_VERSION: "latest" }),
      () => writeTextFile("server.properties", "bad"),
      () => writeBinaryFile("mods/unreviewed.jar", Buffer.from("bad")),
      () => deletePath("world"), () => makeDir("mods"),
    ]) expect(change).toThrow("managed by Komodo");
  });
});
