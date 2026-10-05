#!/usr/bin/env bash
# Build and run the ARM64 panel using Apple's container CLI, without Docker Desktop.
# This is a local UI/API preview; Apple container does not expose a Docker Engine API.
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview_dir="$project_dir/data/apple-preview"
command -v container >/dev/null || { echo "Install Apple's container CLI first." >&2; exit 1; }
container system status >/dev/null
mkdir -p "$preview_dir"
if [[ ! -f "$preview_dir/preview.env" ]]; then
  python3 - "$preview_dir/preview.env" <<'PY'
import os, secrets, sys
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write('PANEL_SESSION_SECRET=' + secrets.token_hex(32) + '\n')
    f.write('PANEL_ADMIN_PASSWORD=' + secrets.token_urlsafe(20) + '\n')
    f.write('APP_DATA_DIR=/preview/dashboard\nMC_DATA_DIR=/preview/mc\nBACKUPS_DIR=/preview/backups\nPROJECT_DIR=/preview/project\n')
PY
fi
case "${1:-start}" in
  build) container build --platform linux/arm64 --cpus 4 --memory 4G -t craftdeck:network-local "$project_dir/dashboard" ;;
  start)
    if container inspect craftdeck-preview >/dev/null 2>&1; then
      container start craftdeck-preview
    else
      container run -d --name craftdeck-preview --cpus 2 --memory 1G \
        -p 127.0.0.1:8080:8080 --env-file "$preview_dir/preview.env" \
        -v "$preview_dir:/preview" craftdeck:network-local
    fi
    echo "Panel: http://localhost:8080/network"
    echo "Login: admin; password is PANEL_ADMIN_PASSWORD in $preview_dir/preview.env"
    echo "Docker orchestration requires the regular Docker deployment; this is an Apple-container UI/API preview."
    ;;
  stop) container stop craftdeck-preview ;;
  *) echo "Usage: $0 {build|start|stop}" >&2; exit 1 ;;
esac
