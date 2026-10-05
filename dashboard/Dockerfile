# syntax=docker/dockerfile:1

FROM node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS runtime
ARG TARGETARCH
ARG DOCKER_CLI_VERSION=27.5.1
ARG COMPOSE_VERSION=v2.32.4

# unzip: mod jar metadata · tar/gzip: backup restore · curl: healthcheck + installs
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip tar gzip python3 \
 && rm -rf /var/lib/apt/lists/*

# Docker CLI + compose plugin so the panel can recreate containers after
# config changes (the socket is mounted by docker-compose.yml).
RUN set -eux; \
    case "${TARGETARCH}" in \
      arm64) arch=aarch64 ;; \
      *)     arch=x86_64  ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${arch}/docker-${DOCKER_CLI_VERSION}.tgz" \
      | tar -xz --strip-components=1 -C /usr/local/bin docker/docker; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
      "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${arch}"; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose; \
    docker --version; docker compose version

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY scripts/restore_data.py /app/restore_data.py

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

# Runs as root: required for the docker socket and to keep edited server
# files owned by the MC user (the panel chowns writes to uid/gid 1000).
CMD ["node", "server.js"]
