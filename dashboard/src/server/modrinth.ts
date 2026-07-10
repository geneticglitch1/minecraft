import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { readEnvFile, writeEnvFile } from "./envfile";
import { env } from "./env";

/**
 * Mod management: the MODRINTH_PROJECTS list in .env is the source of truth
 * for "managed" mods (the itzg image auto-resolves compatible versions on
 * every server start). Manually uploaded jars in mods/ are also surfaced.
 */

const MODRINTH_API = "https://api.modrinth.com/v2";
const UA = "craftdeck-panel/1.0 (self-hosted server dashboard)";

export type ModSearchResult = {
  slug: string;
  title: string;
  description: string;
  downloads: number;
  icon_url: string | null;
  server_side: string;
  client_side: string;
};

export function currentMcVersion(): string {
  return readEnvFile()["MC_VERSION"] || "26.2";
}

export async function searchMods(query: string): Promise<ModSearchResult[]> {
  const facets = JSON.stringify([
    ["project_type:mod"],
    ["categories:fabric"],
    [`versions:${currentMcVersion()}`],
  ]);
  const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=20`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Modrinth search failed (${res.status})`);
  const data = (await res.json()) as { hits: ModSearchResult[] };
  return data.hits;
}

export function managedSlugs(): string[] {
  return (readEnvFile()["MODRINTH_PROJECTS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const PROTECTED_SLUGS = new Set(["fabric-api", "easyauth"]);

export function addManagedMod(slug: string): string[] {
  if (!/^[a-z0-9][a-z0-9\-_]{0,63}$/i.test(slug)) throw new Error("Invalid Modrinth slug");
  const slugs = managedSlugs();
  if (slugs.some((s) => s.toLowerCase() === slug.toLowerCase())) return slugs;
  const next = [...slugs, slug.toLowerCase()];
  writeEnvFile({ MODRINTH_PROJECTS: next.join(",") });
  return next;
}

export function removeManagedMod(slug: string): string[] {
  if (PROTECTED_SLUGS.has(slug.toLowerCase())) {
    throw new Error(`${slug} is required by the panel (auth/loader) and can't be removed here`);
  }
  const next = managedSlugs().filter((s) => s.toLowerCase() !== slug.toLowerCase());
  writeEnvFile({ MODRINTH_PROJECTS: next.join(",") });
  return next;
}

// ── installed jar files ─────────────────────────────────────────────────

export type InstalledMod = {
  file: string;
  name: string;
  id: string | null;
  version: string | null;
  disabled: boolean;
  size: number;
  mtime: number;
};

function modsDir(): string {
  return path.join(env.mcDataDir, "mods");
}

function readFabricModJson(jarPath: string): Promise<{ id?: string; name?: string; version?: string } | null> {
  return new Promise((resolve) => {
    execFile(
      "unzip",
      ["-p", jarPath, "fabric.mod.json"],
      { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          resolve(JSON.parse(stdout.replace(/^﻿/, "")));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

export async function listInstalledMods(): Promise<InstalledMod[]> {
  let entries: string[];
  try {
    entries = fs.readdirSync(modsDir());
  } catch {
    return [];
  }
  const jars = entries.filter((n) => n.endsWith(".jar") || n.endsWith(".jar.disabled"));
  const out: InstalledMod[] = [];
  for (const file of jars) {
    const full = path.join(modsDir(), file);
    const st = fs.statSync(full);
    const meta = await readFabricModJson(full);
    out.push({
      file,
      name: meta?.name ?? file.replace(/\.jar(\.disabled)?$/, ""),
      id: meta?.id ?? null,
      version: meta?.version ?? null,
      disabled: file.endsWith(".disabled"),
      size: st.size,
      mtime: st.mtimeMs,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function safeModFile(file: string): string {
  if (file !== path.basename(file) || !/\.jar(\.disabled)?$/.test(file)) {
    throw new Error("Invalid mod file name");
  }
  return path.join(modsDir(), file);
}

export function toggleMod(file: string): void {
  const full = safeModFile(file);
  const target = full.endsWith(".disabled") ? full.slice(0, -".disabled".length) : `${full}.disabled`;
  fs.renameSync(full, target);
}

export function deleteModFile(file: string): void {
  fs.unlinkSync(safeModFile(file));
}
