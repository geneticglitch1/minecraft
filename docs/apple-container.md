# Apple container for local tests; x86_64 Docker for production

The production target is an **x86_64 Linux host** running the normal Docker Compose
stack. The Dockerfile uses BuildKit's target architecture when installing the Docker
CLI and Compose plugin, so ARM64 local builds and x86_64 production builds each get
the correct binaries. No architecture is forced in the production Compose file.

The Mac development paths use Apple's official `container` CLI. Docker Desktop is
not required. The local data folders are isolated from production data and ignored by Git.

## Native world-server testing on macOS

Prerequisites: Apple silicon, supported macOS, Apple's `container` installed and its
system service running, Node 26, npm, Python 3.12+ (restore helper), and `npm ci` in
`dashboard/`.

```
./scripts/apple-container-dev.sh
```

The control process runs on the Mac at **http://localhost:8081/network**. Credentials
are generated once in `data/apple-native/panel.env` (username `admin`). That process
must run on macOS to invoke Apple's CLI. Minecraft, backups and Velocity run inside
Apple Linux containers. This is intentionally separate from the containerized UI preview.

With `CONTAINER_RUNTIME=apple`, Worlds & Network uses:

- `container image pull` and `container run` for runtime deployment;
- `container inspect`, `stats`, `logs`, `exec`, `stop` and `start` for management;
- a dedicated `craftdeck` virtual network, unless `APPLE_CONTAINER_NETWORK` overrides it;
- Minecraft protocol health checks before reporting servers ready;
- actual container IPs for backup RCON and Velocity backend routes;
- explicit DNS (1.1.1.1 by default; set `APPLE_CONTAINER_DNS` for your resolver);
- the same profile validation, forwarding authentication, backups and restore workflows.

Start all routed servers before initially applying the gateway. Native VM IPs can
change on every stop/start. Panel restart, deploy, snapshot and restore operations
refresh backup RCON and running gateway routes automatically. Updating those routes
restarts Velocity and disconnects its players, even if only one world changed.
Stopped worlds are removed from native routes; an available world temporarily serves
as the lobby if the chosen lobby is offline. If no routed world is ready, the gateway
stops; start a world and apply routing to bring it back. After changing containers
outside the panel, use Restart for each affected profile and apply routing again.
Apple CLI does not implement
Docker restart policies or Compose health scheduling: the adapter waits for startup,
but does not provide a continuous crash/reboot supervisor. Use the production Docker
stack for unattended hosting. A native snapshot uses macOS tar/Python and can be
slower on shared mounts. Apple maps host files into each VM; filesystem ownership
behavior can differ from the Linux production host.

The original primary-server pages still expect their configured `MC_CONTAINER` and
RCON endpoint. The local script creates no primary server; those pages remain offline
until one is explicitly configured. The new network page is the local test surface.
Primary `.env`/Compose configuration apply remains a Docker-only workflow.

Stop individual test servers through the network page (this also stops their backup
writer), or use `container stop --time 90 <name>`. Stop the gateway with
`container stop craftdeck-velocity`. Ctrl-C stops the native control process; it does
not stop already-running Minecraft containers. All test worlds persist under
`data/apple-native/network/`.

## Containerized panel preview

For image/UI/API smoke testing without server orchestration:

```
./scripts/apple-container-preview.sh build
./scripts/apple-container-preview.sh start
```

Open **http://localhost:8080/network**. The login is `admin`; the generated password is
in `data/apple-preview/preview.env`. Stop it with:

```
./scripts/apple-container-preview.sh stop
```

A Linux panel container cannot call the macOS Apple CLI and Apple container does not
supply a Docker Engine socket. Use the native host process above when testing actual
server controls. The image preview faithfully reports missing Docker infrastructure.

## x86_64 production image

Build the production architecture explicitly on the Mac:

```
container build --platform linux/amd64 --cpus 4 --memory 4G \
  -t craftdeck:x86-local dashboard
```

Apple's Rosetta support can run that image for an additional local smoke test:

```
mkdir -p data/apple-x86
container run -d --name craftdeck-x86-preview --arch amd64 --rosetta \
  --cpus 2 --memory 1G -p 127.0.0.1:8082:8080 \
  --env-file data/apple-preview/preview.env \
  -v "$PWD/data/apple-x86:/preview" craftdeck:x86-local
```

This verifies an x86_64 Linux process on the Mac; it is not a performance benchmark
of the real x86_64 server. On the Linux host, use the repository's normal setup and
`docker compose up -d --build`. Network orchestration defaults to Docker there.

Reference: [Apple container documentation](https://github.com/apple/container/tree/main/docs).
