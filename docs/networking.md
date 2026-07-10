# Networking

## Ports

| Port | Service | Exposure |
|---|---|---|
| 25565/tcp | Minecraft | Internet (port-forward this on your router) |
| 8080/tcp | Dashboard | **LAN/VPN only — never port-forward** |
| 25575/tcp | RCON | Docker-internal only (not published at all) |

## Letting friends connect

1. Give the server machine a static LAN IP (router → DHCP reservation)
2. Router → port forwarding → external `25565` → `<server-lan-ip>:25565`
3. Friends connect to your public IP (`curl ifconfig.me`), or set up free dynamic DNS
   (DuckDNS et al.) so they can use a stable name like `yourname.duckdns.org`

Whitelist + EasyAuth handle the "random people found my server" problem — that's what
they're for.

## Keeping the dashboard private

The dashboard is deliberately not hardened for the open internet (it controls Docker).
Reach it from outside your LAN with **Tailscale** (free, ~5 minutes):

```bash
# on the server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Install Tailscale on your phone/laptop, log into the same account, and the panel is at
`http://<server-tailscale-ip>:8080` from anywhere — encrypted, invisible to everyone
else. (WireGuard works just as well if you prefer to self-host the VPN.)

Optionally pin the port binding to specific interfaces in `.env`/compose, and firewall
the host:

```bash
sudo ufw allow 25565/tcp
sudo ufw allow from 192.168.0.0/16 to any port 8080 proto tcp   # LAN only
sudo ufw enable
```

## If you later want the panel on a domain

Put Caddy (or Traefik/nginx) in front for TLS + an extra auth layer, and keep 8080
unpublished. This repo doesn't ship that by default — open an issue with your domain
setup and add a `caddy` service; the panel works fine behind a reverse proxy
(plain HTTP upstream, cookie auth).

## "Is it my internet or the server?"

Performance & Lag page. Server-side lag shows as low TPS / high MSPT (affects everyone
equally); player-side lag shows as high ping for that player only. The page gives a
plain-English verdict and per-player ping history so you can settle the argument.
