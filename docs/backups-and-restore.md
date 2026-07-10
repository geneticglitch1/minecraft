# Backups & restore

## What runs automatically

The `backup` sidecar (itzg/mc-backup) tars the entire server data directory to
`data/backups/world-<timestamp>.tgz`:

- flushes the world to disk first (`save-all`), safe while players are online
- interval: `BACKUP_INTERVAL` in `.env` (default `24h`)
- retention: `BACKUP_RETENTION_DAYS` (default `7`) — older tars are pruned
- excludes caches and logs

Safety backups are also taken automatically before config applies (when enabled) and
world resets.

## Manual backup

- Panel: Backups page → **Back up now**
- CLI: `docker exec mc-backup backup now`

## Restoring

Panel: Backups page → **Restore** → type `restore`. The panel stops the server,
extracts the tar over the data directory, and starts the server again. Everything since
that backup is lost.

CLI fallback (panel down):

```bash
./scripts/restore.sh data/backups/world-20260710-050000.tgz
```

## Off-site copies (recommended)

`data/backups/` is just files — sync it anywhere:

```bash
# example: nightly rsync to another machine (add to the host's crontab)
0 6 * * * rsync -a --delete /path/to/minecraft/data/backups/ backup-host:/srv/mc-backups/
```

You can also download any backup from the panel (⬇ button) before risky experiments.

## Disaster recovery (new machine)

```bash
git clone <repo> minecraft && cd minecraft
./scripts/setup.sh                      # fresh secrets — friends keep their passwords,
                                        # those live in the world data, not in .env
mkdir -p data/backups && cp <your-backup>.tgz data/backups/
docker compose up -d                    # let it initialize once
./scripts/restore.sh data/backups/<your-backup>.tgz
```

The backup contains the world, mods, configs, and the EasyAuth database, so player
registrations survive. Panel state (approval history, metrics) lives in
`data/dashboard/` — include it in your off-site sync if you want it back too.
