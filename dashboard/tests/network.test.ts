import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/server/env", () => ({
  env: { mcDataDir: "", appDataDir: "" },
}));
import { env } from "../src/server/env";
import {
  defaultProfile,
  type NetworkConfig,
  type WorldProfile,
} from "../src/lib/network";
import {
  validateProfile,
  validatePorts,
  validateProxy,
  profileRoot,
  readNetwork,
  writeNetwork,
  profileById,
} from "../src/server/network-config";
import {
  composeJson,
  renderProfileCompose,
  renderVelocity,
  serverEnvironment,
} from "../src/server/network-render";
import { networkFilePath } from "../src/server/network-files";
let dir: string;
const make = (overrides: Partial<WorldProfile> = {}) =>
  validateProfile({ ...defaultProfile, name: "Test world", ...overrides });
const config = (profiles: WorldProfile[]): NetworkConfig => ({
  schema: 1,
  profiles,
  proxy: {
    port: 25566,
    lobby: profiles[0]?.id ?? "",
    motd: 'Friends "together"',
    version: "latest",
  },
  jobs: [],
});
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftdeck-network-"));
  env.mcDataDir = path.join(dir, "mc");
  env.appDataDir = path.join(dir, "app");
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
describe("isolated server profiles", () => {
  it("generates server-owned IDs and ignores caller supplied paths", () => {
    const p = make({ id: "../../outside", name: "../Friends ♥", createdAt: 1 });
    expect(p.id).toMatch(/^friends-[a-f0-9]{8}$/);
    expect(p.createdAt).not.toBe(1);
    expect(() => profileRoot("../escape")).toThrow();
  });
  it.each(["FABRIC", "FORGE", "NEOFORGE", "QUILT", "VANILLA", "MODRINTH"])(
    "does not claim transparent proxy support for %s",
    (loader) => {
      expect(() =>
        make({ loader: loader as WorldProfile["loader"], route: "proxy" }),
      ).toThrow("Automatic secure proxy");
    },
  );
  it("requires exact modpack selection", () => {
    expect(() =>
      make({ loader: "MODRINTH", route: "direct", modpack: "pack" }),
    ).toThrow("exact pack version");
    const p = make({
      loader: "MODRINTH",
      route: "direct",
      modpack: "pack",
      modpackVersion: "version123",
    });
    expect(serverEnvironment(p, "secret")).toMatchObject({
      TYPE: "MODRINTH",
      MODRINTH_MODPACK: "pack",
      MODRINTH_VERSION: "version123",
    });
  });
  it("rejects invalid numbers, types, environment newlines and URL schemes", () => {
    for (const update of [
      { memory: 0 },
      { memory: "4" },
      { pvp: "true" },
      { name: "world\nEULA=TRUE" },
      { resourcePack: "javascript:alert(1)" },
      { mapUrl: "https://user:password@example.com" },
      { version: "latest" },
    ])
      expect(() =>
        validateProfile({ ...defaultProfile, name: "world", ...update }),
      ).toThrow();
  });
  it("requires checksums and validates resource pack consistency", () => {
    expect(() =>
      make({ resourcePack: "https://example.com/pack.zip" }),
    ).toThrow("SHA-1");
    expect(() => make({ resourcePackRequired: true })).toThrow("download URL");
    const p = make({
      resourcePack: "https://example.com/pack.zip",
      resourcePackSha1: "a".repeat(40),
      resourcePackRequired: true,
    });
    expect(serverEnvironment(p, "secret")).toMatchObject({
      RESOURCE_PACK_ENFORCE: "true",
      RESOURCE_PACK_SHA1: "a".repeat(40),
    });
  });
  it("prevents seed, identity, version and runtime changes after initialization", () => {
    const p = make();
    fs.mkdirSync(path.join(profileRoot(p.id), "data"), { recursive: true });
    fs.writeFileSync(
      path.join(profileRoot(p.id), "data", "server.properties"),
      "",
    );
    for (const update of [
      { seed: "123" },
      { version: "1.21.4" },
      { route: "direct" },
      { loader: "FOLIA" },
    ])
      expect(() => validateProfile({ ...p, ...update }, p)).toThrow(
        "Create a new profile",
      );
    expect(validateProfile({ ...p, memory: 8 }, p).memory).toBe(8);
  });
  it("persists registry and rejects malformed registry instead of losing profiles", () => {
    const p = make();
    writeNetwork(config([p]));
    expect(readNetwork().profiles[0]).toEqual(p);
    expect(profileById(readNetwork(), p.id)).toEqual(p);
    fs.writeFileSync(path.join(env.appDataDir, "network.json"), "{");
    expect(() => readNetwork()).toThrow();
  });
});
describe("routing and network isolation", () => {
  it("reserves gateway, primary, dashboard, direct, and map ports together", () => {
    for (const port of [25565, 25566, 8080])
      expect(() =>
        validatePorts(config([make({ route: "direct", port })]), 25565, 8080),
      ).toThrow("already assigned");
    expect(() =>
      validatePorts(
        config([
          make({
            route: "direct",
            port: 25570,
            map: "bluemap",
            mapPort: 25570,
          }),
        ]),
        25565,
        8080,
      ),
    ).toThrow("already assigned");
  });
  it("allows private backends to share internal game ports", () => {
    expect(() =>
      validatePorts(config([make(), make({ name: "Survival" })]), 25565, 8080),
    ).not.toThrow();
  });
  it("rejects duplicate hostname routes and direct-server lobbies", () => {
    const p = make({ hostname: "survival.example.com" });
    expect(() =>
      validatePorts(config([p, make({ hostname: p.hostname })]), 25565, 8080),
    ).toThrow("Duplicate hostname");
    const direct = make({ route: "direct" });
    const c = config([direct]);
    expect(() => validateProxy(c.proxy, c)).toThrow("Paper/Folia");
  });
  it("publishes no backend or RCON ports, isolates storage and enables forwarding authentication", () => {
    const p = make({ map: "bluemap" });
    const rendered = renderProfileCompose(
      p,
      { hostDataDir: "/srv/game/data/mc", network: "minecraft_default" },
      "secret",
      "bluemap:exact",
    );
    expect(rendered.services.server.ports).toEqual(["127.0.0.1:8101:8100"]);
    expect(rendered.services.server.volumes[0]).toBe(
      `/srv/game/data/network/${p.id}/data:/data`,
    );
    expect(rendered.services.backup.volumes[1]).toBe(
      `/srv/game/data/network/${p.id}/backups:/backups`,
    );
    expect(rendered.services.server.environment.ONLINE_MODE).toBe("FALSE");
    expect(rendered.services.server.environment.MODRINTH_PROJECTS).toBe(
      "bluemap:exact",
    );
  });
  it("direct profiles verify accounts and never inherit primary Fabric mods", () => {
    const p = make({ loader: "FORGE", route: "direct" });
    const e = serverEnvironment(p, "secret");
    expect(e.ONLINE_MODE).toBe("TRUE");
    expect(e.MODRINTH_PROJECTS).toBe("");
    expect(e).not.toHaveProperty("FABRIC_LOADER_VERSION");
  });
  it("escapes Compose interpolation in all user strings and credentials", () => {
    expect(
      JSON.parse(composeJson({ password: "${SECRET}", motd: "Costs $5" })),
    ).toEqual({ password: "$${SECRET}", motd: "Costs $$5" });
  });
  it("emits only compatible routes with explicit lobby and modern forwarding", () => {
    const lobby = make({ hostname: "lobby.example.com" });
    const direct = make({ loader: "FABRIC", route: "direct" });
    const text = renderVelocity(config([lobby, direct]));
    expect(text).toContain('player-info-forwarding-mode = "modern"');
    expect(text).toContain("online-mode = true");
    expect(text).toContain(`try = ["${lobby.id}"]`);
    expect(text).toContain(`"lobby.example.com" = ["${lobby.id}"]`);
    expect(text).not.toContain(direct.id);
    expect(text).toContain('motd = "Friends \\"together\\""');
  });
});
describe("profile file boundaries", () => {
  it("rejects traversal and symlink escapes including nonexistent descendants", () => {
    const p = make();
    fs.mkdirSync(path.join(profileRoot(p.id), "data"), { recursive: true });
    fs.mkdirSync(path.join(dir, "outside"));
    fs.symlinkSync(
      path.join(dir, "outside"),
      path.join(profileRoot(p.id), "data", "link"),
    );
    expect(() => networkFilePath(p.id, "../../other")).toThrow("escapes");
    expect(() => networkFilePath(p.id, "link/new/nested.yml")).toThrow(
      "escapes",
    );
    fs.symlinkSync(
      path.join(dir, "outside", "missing"),
      path.join(profileRoot(p.id), "data", "dangling"),
    );
    expect(() => networkFilePath(p.id, "dangling")).toThrow();
    expect(networkFilePath(p.id, "config/new.yml")).toBe(
      path.join(profileRoot(p.id), "data", "config", "new.yml"),
    );
  });
});
