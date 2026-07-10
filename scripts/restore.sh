#!/usr/bin/env bash
# Manual backup restore (fallback for when the dashboard is unavailable).
# The dashboard's Backups page does this same procedure with one click.
#
# Usage: ./scripts/restore.sh data/backups/world-20260710-120000.tgz
set -euo pipefail
cd "$(dirname "$0")/.."

archive="${1:-}"
[[ -n "$archive" && -f "$archive" ]] || {
  echo "Usage: $0 <backup .tgz file>"
  echo "Available backups:"
  ls -1h data/backups/*.tgz 2>/dev/null || echo "  (none)"
  exit 1
}

echo "This will STOP the server and overwrite the current world with:"
echo "  $archive"
read -r -p "Type 'restore' to continue: " confirm
[[ "$confirm" == "restore" ]] || { echo "Aborted."; exit 1; }

docker compose stop mc
tar -xzf "$archive" -C data/mc
docker compose start mc
echo "✔ Restore complete — server starting."
