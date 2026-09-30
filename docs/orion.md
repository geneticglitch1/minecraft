# Orion managed deployment

The authoritative Compose file, release lock, initial preparation script and OPNsense instructions are in `geneticglitch1/homelab-infra`, under `stacks/minecraft/`. Deploy that stack through Komodo on Orion. Do not deploy this repository's root Compose file on top of it.

The release selects Minecraft 26.3, Java 25, Fabric loader 0.19.5, launcher 1.1.2 and exact Modrinth version IDs. Velocity 4.2.0 build 30 consumes TCPShield PROXY protocol; FabricProxy-Lite handles authenticated modern forwarding to the private backend. Offline mode, EasyAuth and the whitelist remain the existing authentication model. Check player UUIDs against a copied world before a migration.

CraftDeck uses `PANEL_MANAGED=true`. Config, mod and file writes, Compose apply and world reset are rejected by the backend. The UI identifies managed mode. Console, player administration, metrics, power controls and backups remain available. These admin controls still have broad authority; managed mode prevents accidental configuration drift and is not a security boundary around the Docker socket.

Persistent state lives in `/opt/minecraft/data/{mc,backups,dashboard,restore}`. CraftDeck mounts their common parent at `/server-data`; this is necessary for Linux rename operations during restore. The deployment lives in `/opt/minecraft/project`, mounted read-only at the same path. Never put a world under a disposable Komodo source checkout.

Build the reviewed source commit on Orion using the infrastructure preparation script. It records Docker's local immutable image ID. Komodo uses that ID with `pull_policy: never`; a restart cannot pull a newer panel. Preparation refuses existing containers or an unknown world. It does not accept the Minecraft EULA or start services.

The panel listens only at `192.168.1.88:8080`, reachable through LAN/VPN and the host firewall. Never forward this port on OPNsense or publish it with NPM. The Docker socket grants host control; keep the panel credentials private.

## Restore and upgrade behavior

A required safety backup failure aborts the operation. A backup request is successful only after a newly created archive passes a complete gzip/tar validation. Power, backup, restore and Compose operations share one reentrant queue within the panel process.

Restores stop both Minecraft and the backup sidecar, validate paths and the managed deployment lock, unpack into a clean staging directory, then move the previous data aside without replacing the bind-mount root. Newer-only files are removed from the active world and retained with the previous data. Failure leaves writers stopped; inspect the recorded restore directory before recovery. Restored files retain the current server directory's ownership.

The panel accepts only backups with the current release lock. For a different release, use a complete stopped backup and the matching deployment/image, following the infrastructure runbook. A world archive does not include the panel database, proxy state or host secrets. Use `cold-backup.sh` for the complete deployment and copy it off Orion.

The root standalone Compose file uses the same restore mount layout. Existing standalone installs must recreate the dashboard with the new mounts and set `PROJECT_DIR` to the absolute host checkout path before using Apply or Restore. `scripts/setup.sh` fills that path for new installs. The manual restore fallback is documented in `scripts/restore.sh`; it stops the panel too, avoiding concurrency with web requests.
