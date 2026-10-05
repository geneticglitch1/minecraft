# Worlds, maps, and a server network

CraftDeck now has **Worlds & Network**, **Live Maps**, and a **Capabilities** guide.
The original Overview, Players, Access, Performance, Schedules and other pages still
manage the primary server. The network page manages additional independent servers;
its Manage dialog scopes console, files, backups and restore to the selected server.

## Quick workflow

1. Open **Worlds & Network → Create server**. Create a Paper lobby, choose an exact
   Minecraft version and matching Java runtime, and enter allowed account usernames.
2. Save, then **Deploy**. This downloads the runtime and waits for Minecraft health.
   Progress and failures appear in Operations even if you leave the page.
3. Add another Paper or Folia world with a different seed. Both servers can run at once.
4. Select the lobby under Network gateway, save, and **Apply routing**.
5. Join the gateway's port, then use `/server <server-id>` to switch servers. IDs appear
   on the cards. Optional hostname routes can enter a server directly through Velocity.

The gateway defaults to **25566**, preserving the primary server's **25565** binding.
To keep one public address at port 25565, your router can forward that external port
into the gateway's host port 25566. Do not bind two services to the same host port.
Changing the lobby and applying routing makes that world the network's entry point.
It restarts the proxy and disconnects current connections; it is not a live migration.

A proxy profile's game and RCON ports are not published. Velocity authenticates
Minecraft accounts and uses modern forwarding with a shared secret; Paper/Folia
are configured to verify that forwarding. All new servers enforce a whitelist.
These identities differ from the primary server's offline/EasyAuth accounts. The
panel does not migrate inventories or authentication databases between them.

## Runtime choices and isolated worlds

| Runtime | Connection | Content |
| --- | --- | --- |
| Paper | Velocity or direct | Paper-compatible plugins |
| Folia | Velocity or direct | Plugins explicitly compatible with Folia |
| Fabric / Forge / NeoForge / Quilt | Direct | Matching loader mods and clients |
| Vanilla | Direct | Vanilla clients and datapacks |
| Modrinth modpack | Direct | Exact pack/version, loader supplied by pack |

Automatic modern forwarding configuration targets Paper/Folia **1.19+**. Fabric and
modded proxy integrations require additional compatible mods and version-specific
setup; this panel deliberately does not auto-route those profiles. A proxy cannot
swap the client's installed modpack. Switching to an incompatible modpack requires
changing the client installation and reconnecting.

Each profile has a separate full data directory, including all dimensions, mods,
plugin configs, inventories and logs. The Copy settings button creates a **fresh
world**, not a clone of terrain. Change its seed or runtime before first deployment.
After initialization, runtime, Minecraft version, Java, modpack version, route and
seed are immutable in the profile editor. Create another profile to explore a new
version or pack without converting existing terrain accidentally. There is no
in-place downgrade or automatic world-conversion feature.

Java 8, 17, 21 and 25 images are available as choices; choose the release required by
your exact Minecraft/loader combination. Choosing a runtime does not verify that
all uploaded mods support it. Modrinth modpacks are checked against the selected
Minecraft version before deployment. Profile runtime images currently use Java tags;
for reproducible production deployments, review and pin the generated image digests.

Folia distributes independent regions across threads. It does not make every plugin
thread-safe or guarantee a player count/TPS. Players clustered in one region, CPU
contention and disk pressure can still cause lag. Allocate RAM for the sum of all
running heaps, at least 1 GiB per server overhead, the proxy, maps and the host OS.

## Maps

Choose BlueMap or Dynmap on a supported profile. Deployment resolves a stable release
advertising the exact Minecraft version and loader; it refuses deployment if no such
release is found. It does not fall back to an incompatible JAR. For a manually installed
renderer, leave automatic installation off and use its own configuration and ingress.

- BlueMap: internal web port **8100**, 3D terrain rendering.
- Dynmap: internal web port **8123**, 2D/isometric map rendering.
- Each maps to its own **host loopback** port. Publish through an HTTPS reverse proxy
  or use an SSH tunnel. Ports are not exposed on every network interface by default.
- Save the resulting browser URL in the profile and open **Live Maps**.
- BlueMap requires its own asset-download consent in its generated config. Stop the
  server, edit it through Manage → Files, and restart after reviewing that setting.
- Initial rendering can be expensive. Configure renderer threads, map dimensions,
  player visibility, permissions, and privacy in the renderer's files.
- Claims need an addon compatible with the renderer and claim plugin. No claims data
  is fabricated by CraftDeck. The viewer displays the renderer's real output.

The embedded viewer requires a working reachable URL; it does not prove map health.
HTTPS pages cannot embed insecure HTTP content. Renderer CSP/framing headers can
require opening the full map in its own tab.

## Resource packs and content

Set a direct ZIP URL, the file's SHA-1, an optional prompt and whether accepting the
pack is required. Deploy applies these server properties. Use a publicly reachable
static file compatible with the client version. The panel configures distribution;
it does not host the ZIP or install client mods. Compute a checksum on macOS with
`shasum -a 1 pack.zip`.

Use comma-separated Modrinth slugs (optionally `slug:version-id`) for managed mods or
plugins. Manage → Files can upload JARs into `mods/` or `plugins/`, and datapack ZIPs
into `world/datapacks/`. Config editing and uploads require the server to be stopped.
There is a 2 MB text editor limit and 100 MB upload limit. Uploads do not overwrite
existing files. Use the profile's Console to manage whitelist entries, gamerules,
weather, time, permissions and supported plugin commands. The saved profile whitelist
is authoritative at deployment, so also update it when adding permanent players.

## Backups, recovery and failures

Every server has a dedicated backup sidecar with an interval and retention policy.
The backup data and output directories belong to that profile only. Manual snapshots
briefly stop Minecraft and the sidecar, write to a partial archive, verify its contents,
then publish it as a completed snapshot. Writers resume afterward. Applying changes
to an existing world requires a verified snapshot first; backup failure cancels apply.

Restore verifies the archive before stopping writers, stages the data with the shared
restore helper, and retains previous contents under `recovery/`. The server remains
stopped after restore for inspection. Restart or deploy it once ready. Manual snapshots
are recovery points; monitor their disk usage in addition to automatic retention.

Operations are serialized with existing primary-server power/backup operations. Their
status is persisted. After a panel crash, unfinished jobs are marked failed and are
**not retried automatically**. Inspect actual container status and logs before retrying.
An unsuccessful deploy can leave the selected server stopped or unhealthy; it does
not claim success or automatically replace data. Proxy config retains a `.previous`
copy before applying changes.

Runtime storage (never commit):

```
data/dashboard/network.json              # profiles, gateway settings, jobs
data/network/<id>/compose.json           # generated Compose + RCON credential
data/network/<id>/data/                  # complete Minecraft server
data/network/<id>/backups/               # this server's archives
data/network/<id>/recovery/              # retained pre-restore data
data/network/proxy/config/velocity.toml  # routes
data/network/proxy/config/forwarding.secret
data/network/proxy/data/                 # proxy runtime and plugins
```

Back up the registry and proxy configuration along with server archives. Local backups
are not off-host disaster recovery. On the production Docker host, deployment expects the standalone primary
server's bind-mounted `/data` directory and one user-defined Docker network. Komodo
managed installations stay read-only and should be extended through homelab-infra.
For native Mac testing using Apple’s container CLI, see [apple-container.md](apple-container.md).

## What else is possible?

The in-panel **Capabilities** guide distinguishes implemented features from addons:
claims/towns, economies, cross-server inventories, permissions, rollback, anti-cheat,
chunk pregeneration, voice chat, Discord bridges, Bedrock bridging, version translation,
custom dimensions, minigames and off-host backups. Those integrations need their own
compatible plugins, ports, databases and configuration; they are not preinstalled.

References: [Velocity compatibility](https://docs.papermc.io/velocity/server-compatibility/),
[modern forwarding](https://docs.papermc.io/velocity/player-information-forwarding/),
[Folia](https://docs.papermc.io/folia/),
[BlueMap installation](https://bluemap.bluecolored.de/wiki/getting-started/Installation.html),
[Docker server properties](https://docker-minecraft-server.readthedocs.io/en/latest/configuration/server-properties/),
[Modrinth modpacks](https://docker-minecraft-server.readthedocs.io/en/latest/types-and-platforms/mod-platforms/modrinth-modpacks/).
