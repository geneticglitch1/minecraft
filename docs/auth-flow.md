# Authentication flow

The server runs with `online-mode=false` so offline launchers (TLauncher, etc.) can
join. That disables Mojang's account verification, so this stack layers two gates on
top:

1. **Whitelist** (vanilla) — only approved usernames can connect at all
2. **EasyAuth** (Fabric mod) — every player must `/register` a password once, then
   `/login` on every join. Unauthenticated players are frozen, invisible to the world,
   and kicked after a timeout.

## The approval lifecycle

```
you approve a name ──► whitelisted + "pending" + countdown starts (default 2 min)
        │
        ├─ player joins and /register-s in time ──► "registered"  (permanent access)
        │
        └─ countdown lapses ──► whitelist entry removed ──► "expired"
                                 (re-approve any time to restart the window)
```

The panel enforces this automatically: a background watcher reconciles the pending list
against EasyAuth's registered accounts every 5 seconds and revokes lapsed windows.

### Why the short window matters

While a name is whitelisted but unregistered, anyone who knows the name could join and
claim it. The window shrinks that exposure to a couple of minutes, and you control
exactly when it opens — approve while your friend is sitting in the launcher. If someone
does sneak in and register a name that isn't theirs, just **Revoke** it (removes the
account + whitelist entry) and approve again.

## In-game commands (players)

| Command | What it does |
|---|---|
| `/register <pass> <pass>` | Create your password (first join only) |
| `/login <pass>` | Log in (every join) |
| `/account` | Change password, manage sessions |
| `/logout` | Log out manually |

## Panel actions (Access & Auth page)

| Action | Effect |
|---|---|
| Approve | Whitelist + open registration window |
| Re-open window | Same, for an expired/revoked name |
| Reset password | Sets a temporary password (shown once) and kicks them to re-login |
| Revoke | Whitelist entry + EasyAuth account deleted, player kicked |
| Import whitelist | Adopt names whitelisted outside the panel |

## Storage

EasyAuth stores password hashes in its own database under
`data/mc/mods/EasyAuth/` (included in backups). The panel's approval state lives in
`data/dashboard/craftdeck.db`. The two are reconciled via RCON (`auth list`,
`auth remove`, `auth update`), so there's no fragile file coupling.

## Tuning

- **Window length**: Settings → "Player registration window" (0.5–120 minutes)
- **EasyAuth options** (kick timeout, session lifetime, password rules):
  Files → `config/EasyAuth/` — edit and restart the server
