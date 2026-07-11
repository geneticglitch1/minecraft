# TCPShield (DDoS protection + real player IPs)

[TCPShield](https://tcpshield.com) sits in front of the server: players connect to
your TCPShield domain, and your real server IP stays hidden and DDoS-protected.
The catch: without extra setup, every connection appears to come from TCPShield's
proxies, so the Security page, IP bans, and connection logs are useless.

TCPShield's own RealIP plugin is Bukkit/Bungee/Velocity-only — it does not exist
for Fabric. The working path for this stack is **PROXY protocol v2** plus the
**Proxy Protocol Support** Fabric mod.

## Setup

1. **TCPShield panel** → your backend → enable **Proxy Protocol**.
2. **Mods page** → Recommended → add **Proxy Protocol Support** → Apply
   (or append `proxy-protocol-support` to `MODRINTH_PROJECTS` in `.env` and
   `docker compose up -d mc`).
3. Nothing else — the mod's configuration is **enforced automatically on every
   boot** by `config/patches/patch-set.json` (see below). Restart once after
   installing so the patch applies:

   ```bash
   docker compose restart mc
   ```

## Verifying it works

Watch the startup log (`docker compose logs -f mc`). You must see all three:

```
Proxy Protocol Support is enabled!
TCPShield integration enabled! Fetching official IPs...
Successfully added 2 TCPShield IPs to the trusted proxy list.
```

Then join through your TCPShield domain — the console shows your **real IP**, and
`docker compose ps` shows `mc` **healthy**.

## How the config is managed (don't hand-edit!)

The mod rewrites `config/proxy_protocol_support.json` at every startup, which
silently clobbers hand edits. Instead, the server image applies
`config/patches/patch-set.json` from this repo **before every server start**,
enforcing:

| Setting | Value | Why |
|---|---|---|
| `enableProxyProtocol` | `true` | decode PROXY protocol headers |
| `whitelistTCPShieldServers` | `true` | auto-fetch TCPShield's proxy IP ranges — no hardcoding, survives their infra changes |
| `proxyServerIPs` | `127.0.0.1` | (TCPShield's ranges are added automatically at runtime) |
| `directAccessIPs` | localhost (`127.0.0.1`, `::1`) + private ranges (`10/8`, `172.16/12`, `192.168/16`) | container healthcheck + LAN/panel access |

To change a value, edit the patch file in the repo and `docker compose up -d mc`.

**First-boot note:** on a brand-new install the mod's config file doesn't exist
yet when patches run, so the very first boot uses mod defaults; every boot after
that is patched. One `docker compose restart mc` after first install settles it.

## Security model

PROXY protocol headers carry no signature, so anyone who finds your raw server IP
could spoof client IPs — the mod prevents this with default-deny:

- PROXY headers are only accepted from **TCPShield's published ranges** (auto-fetched)
- Direct, header-less connections are only accepted from **localhost + LAN**
- Everything else → `REJECTED unauthorized direct connection` in the log

So occasional `REJECTED` lines from random public IPs are the wall working —
that's scanner bots hitting your raw IP and bouncing. A `REJECTED ... /0:0:0:0:0:0:0:1`
(IPv6 localhost) every few seconds means the container healthcheck is being
blocked — that's exactly what the `::1` entry in the patch prevents; if you see
it, the patch didn't apply (check `docker compose logs mc | head -50`).

For belt-and-braces, also enable TCPShield's Advanced Firewall (panel → Network →
Firewall), and consider host-firewalling port 25565 to TCPShield's ranges
(`curl tcpshield.com/v4`) once everything works.

## Gotchas

- **Friends must connect via the TCPShield domain** — direct-IP connections from
  outside your LAN are rejected by design once this is active.
- If real players start bouncing with `REJECTED`, TCPShield may have changed
  their IP ranges *and* the auto-fetch failed at boot — restart the server so it
  re-fetches.
