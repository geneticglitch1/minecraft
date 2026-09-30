# Backups and restore

The backup sidecar archives server data every 24 hours by default and keeps seven days locally. It flushes the world through RCON first and excludes temporary files, caches and logs. Manual panel backups wait for a newly created archive to pass complete gzip/tar validation. A request acknowledgment alone is not backup success.

Config and mod Apply require a successful safety backup; failure cancels the operation. Standalone world reset does too. Orion managed mode rejects configuration changes and world reset entirely; upgrades are reviewed in homelab-infra.

## Same-release world restore

Use the Backups page, or `scripts/restore.sh /absolute/path/backup.tgz` as the standalone fallback. Orion's fallback takes the extra arguments `/opt/minecraft/project /opt/minecraft/data`.

The panel stops Minecraft and the backup writer, validates archive paths and the managed release lock, extracts a clean staging tree, and moves the existing data into a retained `restore-*/previous` directory. It preserves the bind-mount root and correct server ownership. Files that only existed in the newer world are not left active. On failure the writers remain stopped for inspection. The shell fallback also stops the panel to avoid competing requests.

Do not overlay an archive with `tar -xzf` onto a populated world. Keep the world and staging workspace under a common parent mount, on the same filesystem. Reserve disk for the active world, staged copy and retained previous data, and remove retained copies only after confirming a successful recovery.

## Complete recovery

A world archive contains Minecraft and EasyAuth state. It does not contain CraftDeck's database, deployment config, proxy secret or panel credentials. For Orion use `homelab-infra/stacks/minecraft/cold-backup.sh`: it stops the stack and captures the complete deployment plus an export of the pinned panel image. Copy the secret-bearing backup off-host with private permissions.

Restore a different release only with its matching complete backup, release lock and image. Keep the failed state recoverable, restore into a clean directory and recreate containers when replacing mount roots. Do not downgrade Minecraft against a newer world. Test the complete restore in isolation before relying on it. See [orion.md](orion.md) and the infrastructure runbook for the release workflow.
