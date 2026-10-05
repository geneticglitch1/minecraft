#!/usr/bin/env bash
# Native macOS control process + Apple Linux containers for local server testing.
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_dir="$project_dir/data/apple-native"
command -v container >/dev/null
container system status >/dev/null
mkdir -p "$local_dir/project"
if [[ ! -f "$local_dir/panel.env" ]]; then
  python3 - "$local_dir/panel.env" <<'PY'
import os, secrets, sys
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
    for key in ('PANEL_SESSION_SECRET','PANEL_ADMIN_PASSWORD','RCON_PASSWORD'):
        f.write(key+'='+secrets.token_hex(24)+'\n')
PY
fi
set -a
source "$local_dir/panel.env"
set +a
export CONTAINER_RUNTIME=apple
export APPLE_CONTAINER_CLI="$(command -v container)"
export APP_DATA_DIR="$local_dir/dashboard"
export MC_DATA_DIR="$local_dir/mc"
export BACKUPS_DIR="$local_dir/backups"
export PROJECT_DIR="$local_dir/project"
export RESTORE_HELPER="$project_dir/dashboard/scripts/restore_data.py"
export RESTORE_WORK_DIR="$local_dir/recovery"
export NEXT_TELEMETRY_DISABLED=1
export PORT="${CRAFTDECK_LOCAL_PORT:-8081}"
echo "Native Apple runtime panel: http://localhost:$PORT/network"
echo "Login: admin; password is PANEL_ADMIN_PASSWORD in $local_dir/panel.env"
cd "$project_dir/dashboard"
exec npm run dev -- --hostname 127.0.0.1 --port "$PORT"
