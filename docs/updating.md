# Updating

## Upgrading Minecraft (e.g. 26.2 → 26.3)

1. **Configuration** page → change `Minecraft version` → **Save**
2. **Apply** with *"Take a safety backup first"* enabled
3. The server container is recreated: the new server jar, a matching Fabric loader, and
   fresh builds of every managed mod are downloaded automatically

If a managed mod has no build for the new version yet, the server won't start — check
the Console page for which one, remove it from the Mods page (or wait a few days), and
Apply again. Worlds upgrade forward automatically; **there is no downgrade** — that's
what the safety backup is for.

Command-line equivalent:

```bash
sed -i 's/^MC_VERSION=.*/MC_VERSION=26.3/' .env
docker exec mc-backup backup now
docker compose up -d mc
```

## Updating mods only

Mods page → **Update all & restart**. (Any server restart re-resolves managed mods.)

## Updating the panel / images

```bash
git pull
docker compose pull          # new itzg server + backup images
docker compose build dashboard
docker compose up -d
```

## Snapshots / release candidates

`MC_VERSION` accepts any version the launcher knows (`26.3-rc-1`, `26.3-snapshot-3`…).
Mods rarely support snapshots — expect to trim the mod list if you try them.
