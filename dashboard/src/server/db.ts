import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Panel database (node:sqlite — no native deps). Single connection reused
 * across HMR reloads via globalThis.
 */
const g = globalThis as unknown as { __craftdeckDb?: DatabaseSync };

function open(): DatabaseSync {
  fs.mkdirSync(env.appDataDir, { recursive: true });
  const db = new DatabaseSync(path.join(env.appDataDir, "craftdeck.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS panel_users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      must_change INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approved_players (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE COLLATE NOCASE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | registered | expired | revoked
      approved_at INTEGER,
      window_expires_at INTEGER,
      registered_at INTEGER,
      last_seen_at INTEGER,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,   -- join | leave | register | approve | expire | revoke | server_online | server_offline | backup | chat_command | crash
      player TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity(ts DESC);
    CREATE TABLE IF NOT EXISTS metrics (
      ts INTEGER PRIMARY KEY,
      cpu REAL, mem_used INTEGER, mem_limit INTEGER,
      net_rx INTEGER, net_tx INTEGER,
      tps REAL, mspt REAL, players INTEGER,
      disk_used INTEGER, disk_free INTEGER
    );
    CREATE TABLE IF NOT EXISTS ping_samples (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      player TEXT NOT NULL,
      ping INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ping_ts ON ping_samples(ts DESC);
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,  -- info | success | warn | error
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      cron TEXT NOT NULL,
      action TEXT NOT NULL,  -- restart | backup | command | announce
      payload TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      last_result TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function db(): DatabaseSync {
  if (!g.__craftdeckDb) g.__craftdeckDb = open();
  return g.__craftdeckDb;
}

// ── settings helpers ────────────────────────────────────────────────────

export function getSetting(key: string, fallback: string): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getBoolSetting(key: string, fallback: boolean): boolean {
  return getSetting(key, fallback ? "1" : "0") === "1";
}

// ── activity helpers ────────────────────────────────────────────────────

export function logActivity(type: string, player?: string | null, detail?: string | null) {
  db()
    .prepare("INSERT INTO activity(ts, type, player, detail) VALUES(?, ?, ?, ?)")
    .run(Date.now(), type, player ?? null, detail ?? null);
}
