import fs from "node:fs";
import { db } from "./db";
import { env } from "./env";
import { hashPassword, generatePassword } from "./passwords";
import { startLogWatcher } from "./logwatch";
import { startSampler } from "./sampler";
import { startAuthWatcher } from "./authflow";
import { startScheduler } from "./scheduler";

/**
 * One-time process bootstrap, invoked from instrumentation.ts when the
 * Next.js server starts. Guarded against dev-mode HMR re-execution.
 */

const g = globalThis as unknown as { __craftdeckBooted?: boolean };

export function boot() {
  if (g.__craftdeckBooted) return;
  g.__craftdeckBooted = true;

  for (const dir of [env.appDataDir, env.mcDataDir, env.backupsDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  seedAdminUser();
  startLogWatcher();
  startSampler();
  startAuthWatcher();
  startScheduler();

  console.log(`[craftdeck] panel services started (data: ${env.appDataDir})`);
}

function seedAdminUser() {
  const count = (db().prepare("SELECT COUNT(*) AS n FROM panel_users").get() as { n: number }).n;
  if (count > 0) return;
  let password = env.initialAdminPassword;
  let generated = false;
  if (!password) {
    password = generatePassword(14);
    generated = true;
  }
  db()
    .prepare("INSERT INTO panel_users(username, pass_hash, must_change, created_at) VALUES(?, ?, 1, ?)")
    .run("admin", hashPassword(password), Date.now());
  if (generated) {
    console.log("┌──────────────────────────────────────────────────────┐");
    console.log("│  CraftDeck first run — dashboard login               │");
    console.log(`│    username: admin                                   │`);
    console.log(`│    password: ${password.padEnd(40)}│`);
    console.log("│  You will be asked to change it on first login.      │");
    console.log("└──────────────────────────────────────────────────────┘");
  } else {
    console.log("[craftdeck] admin user seeded from PANEL_ADMIN_PASSWORD (change it on first login)");
  }
}
