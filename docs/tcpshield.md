# TCPShield on Orion

Use the maintained runbook in `homelab-infra/stacks/minecraft/TCPSHIELD.md` for the exact OPNsense and host firewall steps.

Traffic flows: player → TCPShield → OPNsense source-restricted TCP 25565 DNAT → Orion Velocity → private Fabric backend. Enable PROXY protocol in TCPShield and `haproxy-protocol = true` in Velocity. Velocity then uses modern forwarding, with the same secret as `FABRIC_PROXY_SECRET` in FabricProxy-Lite.

The reviewed deployment pins Minecraft 26.3 and Velocity 4.2.0 build 30. The direct Fabric `proxy-protocol-support` mod did not advertise 26.3 support at review time, so it is not used. The old `config/patches` files are legacy and are no longer mounted by the standalone Compose file. Do not combine that legacy direct-server guide with the Velocity deployment.

OPNsense must preserve the TCPShield source address and permit only the official IPv4 ranges from https://tcpshield.com/v4/. Host DOCKER-USER rules enforce the same restriction before trusted-LAN exceptions. Do not add game port 25565 to unrestricted public ports. Do not expose the backend, RCON, panel or a map port.

The public Minecraft hostname is a DNS-only CNAME to the hostname assigned by TCPShield. An ordinary Cloudflare orange-cloud HTTP proxy is not a Minecraft proxy. Use the public protected hostname even from home; direct LAN joins intentionally fail on the protected proxy port.

Verify an external join, real player IP, EasyAuth registration, whitelist/UUID continuity and direct-origin rejection before inviting players. Configure TCPShield for the exact protected hostname and backend; account/plan controls and any account-specific verification steps must be completed in its dashboard.

Sources: [TCPShield documentation](https://docs.tcpshield.com/), [Velocity forwarding](https://docs.papermc.io/velocity/player-information-forwarding/), [OPNsense NAT](https://docs.opnsense.org/manual/nat.html).
