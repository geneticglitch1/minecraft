# Minecraft 26.3 Fabric Server + CraftDeck Panel

For Orion, use the managed deployment in **homelab-infra**, described in [docs/orion.md](docs/orion.md). The root Compose file is the standalone LAN setup; it is not the TCPShield ingress configuration.

A production-quality, self-hosted Minecraft **Java 26.3** server for friends:

- **Fabric** loader with invisible server-side performance mods — any vanilla client
  (including TLauncher) can join, no client mods needed
- **Offline mode + gated authentication**: only usernames *you* approve can join, each
  must register a password within a short window, and log in on every visit
- **CraftDeck**, a full web management panel: live console, players & stats, lag
  diagnostics, performance graphs, mod manager with Modrinth search, backups & restore,
  file browser/editor, config editor, scheduled tasks, Discord alerts
- **Automatic backups** with retention, **one-command deployment**, everything in Docker

| | |
|---|---|
| Minecraft | `26.3` (review loader and all mod pins together) |
| Loader | Fabric (NeoForge/Forge/vanilla supported via config) |
| Server mods | Fabric API, EasyAuth, spark, Lithium, FerriteCore — auto-updated |
| Panel | Next.js, port `8080`, LAN/VPN only |
| Host needs | Linux x86_64, Docker + Compose, ~10 GB RAM |

---

## Quick start

```bash
git clone <this-repo> minecraft && cd minecraft
./scripts/setup.sh          # creates .env with generated secrets, prints your panel login
docker compose up -d        # first start downloads the server + mods (a few minutes)
```

Then open **http://\<server-ip\>:8080**, log in (`admin` / password printed by setup.sh),
change the password, and you're live:

- Minecraft: `<server-ip>:25565`
- Dashboard: `http://<server-ip>:8080`

> No `setup.sh`? Copy `.env.example` to `.env` and fill in `RCON_PASSWORD`,
> `PANEL_SESSION_SECRET`, `PANEL_ADMIN_PASSWORD` yourself.

## Letting a friend join (the auth flow)

1. Panel → **Access & Auth** → type their Minecraft username → **Approve & open window**
2. Tell them to join `<server-ip>:25565` **right away** (TLauncher: any username works,
   but it must match the approved name exactly)
3. In game they run `/register <password> <password>` before the countdown ends
   (default 2 minutes — configurable in Settings)
4. Done. On every future visit they just `/login <password>`

If the window lapses, the name is auto-removed from the whitelist — re-approve when
they're ready. Full details: [docs/auth-flow.md](docs/auth-flow.md).

## Everyday operations

| Task | Where |
|---|---|
| Start / stop / restart | Overview page (or `docker compose restart mc`) |
| Watch console, run commands | Console page |
| See who's lagging (them vs you) | Performance & Lag page |
| Add/remove mods | Mods page (Modrinth search built in) |
| Back up / restore | Backups page |
| Change version, memory, MOTD… | Configuration page → Save → Apply |
| Auto-restarts & scheduled backups | Schedules page |
| Discord alerts | Settings page |

## Documentation

- [docs/auth-flow.md](docs/auth-flow.md) — how the approval/registration system works
- [docs/mods-and-modpacks.md](docs/mods-and-modpacks.md) — adding mods, switching to modpacks or other loaders
- [docs/updating.md](docs/updating.md) — upgrading Minecraft, mods, and the panel
- [docs/backups-and-restore.md](docs/backups-and-restore.md) — backup schedule, restores, disaster recovery
- [docs/networking.md](docs/networking.md) — ports, firewall, Tailscale, why the panel stays off the internet
- [docs/troubleshooting.md](docs/troubleshooting.md) — common problems and fixes

## Architecture

```
docker-compose.yml
├── mc         itzg/minecraft-server  (Fabric 26.3, offline mode, whitelist enforced,
│              RCON on the internal network only, mods resolved from Modrinth at start)
├── backup     itzg/mc-backup         (scheduled world tars + retention pruning)
└── dashboard  ./dashboard            (CraftDeck: Next.js + node:sqlite; talks to the
                                       Docker socket, RCON, and the server files)
data/
├── mc/        world, configs, mods, logs      (bind mount → survives everything)
├── backups/   world-*.tgz
└── dashboard/ panel database
```

The panel's registration-window enforcement, activity feed, metrics sampler, and
scheduler run inside the dashboard container; state lives in `data/dashboard/` and the
`.env` file is the single source of truth for server configuration.

## Security model (read this once)

- The Minecraft port (25565) is the only thing that should ever be internet-exposed.
- `online-mode=false` means Mojang doesn't verify usernames — the whitelist + EasyAuth
  passwords are what keep strangers out. Keep registration windows short.
- The dashboard can start/stop containers and edit server files (it mounts the Docker
  socket), so treat it like root on the host: **LAN or VPN only, never port-forward
  8080.** See [docs/networking.md](docs/networking.md) for the Tailscale setup.
- RCON is not published outside the Docker network.
