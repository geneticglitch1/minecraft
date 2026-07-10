#!/usr/bin/env bash
# One-time setup: creates .env with generated secrets, prepares data dirs.
# Usage: ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo ".env already exists — leaving it untouched."
  echo "Delete it first if you really want to regenerate secrets."
  exit 1
fi

command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }

rcon_pw="$(openssl rand -hex 24)"
session_secret="$(openssl rand -hex 32)"
admin_pw="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-16)"

sed -e "s|^RCON_PASSWORD=.*|RCON_PASSWORD=${rcon_pw}|" \
    -e "s|^PANEL_SESSION_SECRET=.*|PANEL_SESSION_SECRET=${session_secret}|" \
    -e "s|^PANEL_ADMIN_PASSWORD=.*|PANEL_ADMIN_PASSWORD=${admin_pw}|" \
    .env.example > .env

mkdir -p data/mc data/backups data/dashboard

echo
echo "  ✔ .env created with generated secrets"
echo "  ✔ data directories prepared"
echo
echo "  Dashboard login (you must change this password on first login):"
echo "      username: admin"
echo "      password: ${admin_pw}"
echo
echo "  Next:  docker compose up -d"
echo "  Panel: http://<server-ip>:8080   Minecraft: <server-ip>:25565"
