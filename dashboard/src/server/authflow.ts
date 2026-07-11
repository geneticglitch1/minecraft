import { db, getSetting, logActivity } from "./db";
import { bus } from "./bus";
import { notify } from "./notify";
import { env } from "./env";
import { generatePassword } from "./passwords";
import {
  isValidUsername,
  whitelistAdd,
  whitelistRemove,
  whitelistList,
  whitelistLive,
  kickPlayer,
  easyauthList,
  easyauthRemove,
  easyauthSetPassword,
} from "./mc";

/**
 * The approval state machine for offline-mode security:
 *
 *   approve → whitelisted + "pending" with a short registration window
 *   pending + /register in time        → "registered" (can play forever)
 *   pending + window lapses            → whitelist removed, "expired"
 *   revoke                             → whitelist + EasyAuth account removed
 *
 * Enforcement runs in a background watcher that reconciles against
 * EasyAuth's registered-account list via RCON.
 */

export type ApprovedPlayer = {
  id: number;
  username: string;
  status: "pending" | "registered" | "expired" | "revoked";
  approved_at: number | null;
  window_expires_at: number | null;
  registered_at: number | null;
  last_seen_at: number | null;
  note: string | null;
};

function windowMs(): number {
  const minutes = Number(getSetting("registration_window_minutes", String(env.registrationWindowMinutes)));
  return Math.max(0.5, minutes) * 60 * 1000;
}

export function listApproved(): ApprovedPlayer[] {
  return db()
    .prepare("SELECT * FROM approved_players ORDER BY approved_at DESC")
    .all() as unknown as ApprovedPlayer[];
}

export async function approvePlayer(username: string, note?: string): Promise<ApprovedPlayer> {
  if (!isValidUsername(username)) throw new Error("Invalid username (3–16 chars, letters/digits/underscore)");
  const existing = db()
    .prepare("SELECT * FROM approved_players WHERE username = ?")
    .get(username) as unknown as ApprovedPlayer | undefined;
  if (existing?.status === "registered") throw new Error(`${username} is already registered`);
  if (existing?.status === "pending") throw new Error(`${username} already has an open registration window`);

  await whitelistAdd(username); // throws if the server is unreachable — approval requires a running server

  const now = Date.now();
  const expires = now + windowMs();
  db()
    .prepare(
      `INSERT INTO approved_players(username, status, approved_at, window_expires_at, note)
       VALUES(?, 'pending', ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         status = 'pending', approved_at = excluded.approved_at,
         window_expires_at = excluded.window_expires_at, registered_at = NULL,
         note = COALESCE(excluded.note, approved_players.note)`
    )
    .run(username, now, expires, note ?? null);
  logActivity("approve", username, `Registration window open for ${Math.round(windowMs() / 60000)} min`);
  notify("info", `Approved ${username}`, "They can now join and /register — the window is ticking.");
  return db().prepare("SELECT * FROM approved_players WHERE username = ?").get(username) as unknown as ApprovedPlayer;
}

export async function revokePlayer(username: string): Promise<void> {
  if (!isValidUsername(username)) throw new Error("Invalid username");
  try {
    await whitelistRemove(username);
  } catch {}
  try {
    await easyauthRemove(username);
  } catch {}
  try {
    await kickPlayer(username, "Your access was revoked");
  } catch {}
  db()
    .prepare("UPDATE approved_players SET status = 'revoked', window_expires_at = NULL WHERE username = ?")
    .run(username);
  logActivity("revoke", username);
  notify("warn", `Revoked ${username}`, "Whitelist entry and account removed.");
}

/** Re-open a registration window for an expired/revoked player. */
export async function reopenWindow(username: string): Promise<void> {
  const row = db()
    .prepare("SELECT * FROM approved_players WHERE username = ?")
    .get(username) as unknown as ApprovedPlayer | undefined;
  if (!row) throw new Error("Unknown player");
  if (row.status === "registered") throw new Error("Player is already registered");
  await whitelistAdd(username);
  db()
    .prepare("UPDATE approved_players SET status = 'pending', approved_at = ?, window_expires_at = ? WHERE username = ?")
    .run(Date.now(), Date.now() + windowMs(), username);
  logActivity("approve", username, "Registration window re-opened");
  notify("info", `Re-opened window for ${username}`);
}

/** Set a temporary password for a registered player (returned once, never stored). */
export async function resetPassword(username: string): Promise<string> {
  const temp = generatePassword(10);
  await easyauthSetPassword(username, temp);
  try {
    await kickPlayer(username, "Your password was reset — log in with the new one");
  } catch {}
  logActivity("password_reset", username);
  notify("info", `Password reset for ${username}`, "Share the temporary password with them privately.", {
    discord: false,
  });
  return temp;
}

/** Delete the EasyAuth account but keep them whitelisted with a fresh window. */
export async function forceReregister(username: string): Promise<void> {
  await easyauthRemove(username);
  try {
    await kickPlayer(username, "Please rejoin and /register a new password");
  } catch {}
  await whitelistAdd(username);
  db()
    .prepare("UPDATE approved_players SET status = 'pending', window_expires_at = ?, registered_at = NULL WHERE username = ?")
    .run(Date.now() + windowMs(), username);
  logActivity("approve", username, "Forced re-registration");
}

/** Import whitelist entries that were added outside the panel. */
export async function importFromWhitelist(): Promise<number> {
  const [wl, registered] = await Promise.all([whitelistList(), easyauthList()]);
  const registeredSet = new Set(registered.map((n) => n.toLowerCase()));
  let added = 0;
  const insert = db().prepare(
    `INSERT OR IGNORE INTO approved_players(username, status, approved_at, registered_at, note)
     VALUES(?, ?, ?, ?, 'imported from whitelist')`
  );
  for (const name of wl) {
    const isReg = registeredSet.has(name.toLowerCase());
    const res = insert.run(name, isReg ? "registered" : "expired", Date.now(), isReg ? Date.now() : null);
    if (res.changes > 0) added++;
  }
  return added;
}

// ── background watcher ──────────────────────────────────────────────────

const g = globalThis as unknown as { __craftdeckAuthWatch?: { timer: NodeJS.Timeout } };

async function reconcile() {
  const pending = db()
    .prepare("SELECT * FROM approved_players WHERE status = 'pending'")
    .all() as unknown as ApprovedPlayer[];
  if (pending.length === 0) return;

  let registered: Set<string> | null = null;
  try {
    registered = new Set((await easyauthList()).map((n) => n.toLowerCase()));
  } catch {
    // Server offline: don't expire windows while nobody could register anyway —
    // extend windows by the poll interval instead of punishing the player.
    db()
      .prepare("UPDATE approved_players SET window_expires_at = window_expires_at + 5000 WHERE status = 'pending'")
      .run();
    return;
  }

  // Self-heal: make sure the server's LIVE whitelist actually contains every
  // pending player. A `whitelist reload` can get lost (stale RCON connection,
  // server restart mid-approval) — without this check the player sits at
  // "You are not white-listed" while their window burns down.
  try {
    const live = new Set((await whitelistLive()).map((n) => n.toLowerCase()));
    const missing = pending.filter((p) => !live.has(p.username.toLowerCase()));
    if (missing.length > 0) {
      for (const p of missing) await whitelistAdd(p.username); // rewrites file + reloads
      // They couldn't have joined yet — give the windows back the lost time.
      db()
        .prepare("UPDATE approved_players SET window_expires_at = window_expires_at + 5000 WHERE status = 'pending'")
        .run();
      logActivity("whitelist_heal", null, missing.map((m) => m.username).join(", "));
      return;
    }
  } catch {
    // whitelist list unavailable — fall through and try again next tick
  }

  const now = Date.now();
  for (const p of pending) {
    if (registered.has(p.username.toLowerCase())) {
      db()
        .prepare("UPDATE approved_players SET status = 'registered', registered_at = ?, window_expires_at = NULL WHERE id = ?")
        .run(now, p.id);
      logActivity("register", p.username);
      notify("success", `${p.username} registered`, "They can now log in with their password.");
      bus().emit("mc-event", { ts: now, type: "register", player: p.username });
    } else if (p.window_expires_at !== null && p.window_expires_at < now) {
      try {
        await whitelistRemove(p.username);
      } catch {}
      try {
        await kickPlayer(p.username, "Registration window expired — ask the admin to approve you again");
      } catch {}
      db().prepare("UPDATE approved_players SET status = 'expired' WHERE id = ?").run(p.id);
      logActivity("expire", p.username, "Registration window expired");
      notify("warn", `Window expired for ${p.username}`, "They didn't register in time. Re-approve when they're ready.");
    }
  }
}

export function startAuthWatcher() {
  if (g.__craftdeckAuthWatch) return;
  g.__craftdeckAuthWatch = {
    timer: setInterval(() => void reconcile().catch(() => {}), 5000),
  };
  // React immediately to registration hints from the log watcher.
  bus().on("mc-event", (e: { type: string }) => {
    if (e.type === "register-hint") void reconcile().catch(() => {});
  });
}
