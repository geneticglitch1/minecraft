#!/usr/bin/env bash
# Clean restore fallback. Python 3.12+ required. Retains the prior world.
# Standalone: scripts/restore.sh /absolute/backup.tgz
# Orion: scripts/restore.sh /absolute/backup.tgz /opt/minecraft/project /opt/minecraft/data
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
archive=${1:?Supply an existing archive}
archive=$(realpath "$archive")
project=${2:-$repo}
data=${3:-$repo/data}
[[ -f "$archive" ]] || exit 1
helper="$repo/dashboard/scripts/restore_data.py"
python3 "$helper" verify --archive "$archive"
echo "Restore $archive into $data/mc; retain current data in $data/restore."
read -r -p "Type 'restore' to stop the stack and continue: " confirm
[[ "$confirm" == restore ]] || exit 1
cd "$project"
export PROJECT_DIR="$project"
# Stop the panel as well: its in-process queue cannot coordinate with this script.
running=$(docker compose ps --status running --services)
docker compose stop dashboard backup mc
args=(restore --archive "$archive" --data "$data/mc" --work "$data/restore")
[[ ! -f "$project/release-lock.json" ]] || args+=(--lock-file "$project/release-lock.json")
# On failure, leave writers stopped for inspection.
python3 "$helper" "${args[@]}"
for service in mc backup dashboard; do
    if [[ $'\n'"$running"$'\n' == *$'\n'"$service"$'\n'* ]]; then docker compose start "$service"; fi
done
echo 'Restore complete. Previous data was retained in the restore workspace.'
