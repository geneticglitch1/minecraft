import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { assertDeploymentEditable } from "./managed";

/**
 * Sandboxed file access for the file browser / editors. Every path is
 * resolved against the server data root and verified to stay inside it
 * (including through symlinks).
 */

const MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

// The Minecraft server runs as uid/gid 1000 (itzg image default); files the
// panel creates must stay writable by it.
const MC_UID = 1000;
const MC_GID = 1000;

export function resolveSafe(rel: string): string {
  const root = env.mcDataDir;
  const cleaned = path.normalize(rel).replace(/^([/\\])+/, "");
  const abs = path.resolve(root, cleaned);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("Path escapes the server data directory");
  }
  // Make sure symlinks don't lead outside the root. Check the path itself
  // when it exists, otherwise its parent (for files about to be created).
  const target = fs.existsSync(abs) ? abs : path.dirname(abs);
  if (fs.existsSync(target)) {
    const real = fs.realpathSync(target);
    const realRoot = fs.realpathSync(root);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new Error("Path escapes the server data directory");
    }
  }
  return abs;
}

export type DirEntry = {
  name: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
};

export function listDir(rel: string): DirEntry[] {
  const abs = resolveSafe(rel);
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .map((e) => {
      let size = 0;
      let mtime = 0;
      try {
        const st = fs.statSync(path.join(abs, e.name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch {}
      return {
        name: e.name,
        type: e.isDirectory() ? ("dir" as const) : ("file" as const),
        size,
        mtime,
      };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

export function readTextFile(rel: string): { content: string; truncated: boolean } {
  const abs = resolveSafe(rel);
  const st = fs.statSync(abs);
  if (st.size > MAX_EDITABLE_BYTES) {
    const fd = fs.openSync(abs, "r");
    const buf = Buffer.alloc(MAX_EDITABLE_BYTES);
    fs.readSync(fd, buf, 0, MAX_EDITABLE_BYTES, 0);
    fs.closeSync(fd);
    return { content: buf.toString("utf8"), truncated: true };
  }
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) throw new Error("Binary file — download it instead");
  return { content: buf.toString("utf8"), truncated: false };
}

export function writeTextFile(rel: string, content: string): void {
  assertDeploymentEditable();
  const abs = resolveSafe(rel);
  fs.writeFileSync(abs, content);
  fixOwnership(abs);
}

export function writeBinaryFile(rel: string, data: Buffer): void {
  assertDeploymentEditable();
  const abs = resolveSafe(rel);
  fs.writeFileSync(abs, data);
  fixOwnership(abs);
}

export function deletePath(rel: string): void {
  assertDeploymentEditable();
  const abs = resolveSafe(rel);
  if (abs === env.mcDataDir) throw new Error("Refusing to delete the data root");
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    fs.rmdirSync(abs); // only empty dirs — bulk deletion is deliberately unsupported
  } else {
    fs.unlinkSync(abs);
  }
}

export function makeDir(rel: string): void {
  assertDeploymentEditable();
  const abs = resolveSafe(rel);
  fs.mkdirSync(abs, { recursive: true });
  fixOwnership(abs);
}

export function fileStream(rel: string): { stream: fs.ReadStream; size: number; name: string } {
  const abs = resolveSafe(rel);
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error("Not a file");
  return { stream: fs.createReadStream(abs), size: st.size, name: path.basename(abs) };
}

function fixOwnership(abs: string) {
  try {
    fs.chownSync(abs, MC_UID, MC_GID);
  } catch {
    // Not root (local dev) — fine.
  }
}
