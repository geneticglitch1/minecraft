# Troubleshooting

## Server won't start

**Check the Console page first** (or `docker logs mc --tail 100`).

| Symptom in logs | Fix |
|---|---|
| `EULA` complaints | `EULA=TRUE` is set by compose — make sure you didn't override it |
| A mod failed to resolve for your version | Remove that slug on the Mods page, Apply. (New MC version + mod hasn't updated yet.) |
| `No candidate versions of '<mod>' … matched versionType=release` | The mod only ships beta builds for this MC version — append `:beta` to its entry in `MODRINTH_PROJECTS` (e.g. `easyauth:beta`) and `docker compose up -d mc` |
| `OutOfMemoryError` | Lower `MC_VIEW_DISTANCE`, or raise `MC_MEMORY`/`MC_CONTAINER_MEM_LIMIT` if the host has headroom |
| Port already in use | Something else on 25565 — change `MC_PORT` in `.env` |
| Crash right after "Done" | A mod conflict — disable recently added jars (Mods page → power icon) |

## A friend can't join

Work down this list:

1. **"Not whitelisted"** → their username isn't approved (or the window expired and
   auto-revoked them). Access & Auth → approve/re-open. Username must match **exactly**
   (case matters in TLauncher).
   Note: always whitelist through the panel, not with `whitelist add` in the console —
   the vanilla command looks names up at Mojang and can store a *premium* UUID that
   will never match an offline player. The panel writes the correct offline UUID
   directly. If someone was added via the console and can't join, revoke and
   re-approve them from the panel.
2. **Kicked with a "secure profile" / "invalid signature" style error** →
   `enforce-secure-profile` must be `false` for offline launchers. The compose file
   sets `ENFORCE_SECURE_PROFILE: "FALSE"`; if you edited `server.properties` by hand,
   make sure `enforce-secure-profile=false`.
3. **Joins but immediately kicked** → they didn't `/register` or `/login` in time —
   EasyAuth kicks unauthenticated players after a timeout. Tell them to type faster or
   raise the timeout in `config/EasyAuth/`.
4. **"Connection timed out"** → networking: is 25565 port-forwarded? Are they using
   your *public* IP? Does `docker compose ps` show `mc` healthy?
5. **Wrong password loop** → Access & Auth → **Reset password**, share the temporary
   one privately.

## Panel shows "Offline" but the server is up

The dashboard container can't reach the Docker socket or RCON:

```bash
docker compose ps                      # is mc-dashboard running?
docker logs mc-dashboard --tail 50
docker compose up -d --force-recreate dashboard
```

If you changed `RCON_PASSWORD` in `.env`, Apply/recreate **both** `mc` and `dashboard`
so they agree.

## Forgot the panel password

```bash
docker compose stop dashboard
rm data/dashboard/craftdeck.db        # wipes panel users/settings/history — NOT the world
# set PANEL_ADMIN_PASSWORD in .env to a fresh value
docker compose up -d dashboard
```

Player approvals are re-importable afterwards (Access & Auth → Import whitelist).

## Lag

Performance & Lag page tells you *who* is lagging (server vs a player's connection).
If it's the server: check the CPU/memory charts, run the spark health report, lower
view/simulation distance, or add more RAM. If it's one player: it's their network —
nothing to fix server-side.

## Disk filling up

Backups page shows total backup size; lower `BACKUP_RETENTION_DAYS`. The panel also
raises a low-disk alert below 2 GB free.

## Nuke everything and start over (keeps nothing)

```bash
docker compose down
rm -rf data
./scripts/setup.sh && docker compose up -d
```
