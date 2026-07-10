# Mods & modpacks

## Why Fabric

- First loader to support new Minecraft versions (26.x drops land on Fabric within days)
- The best server-side performance ecosystem (Lithium, FerriteCore, spark)
- EasyAuth (the auth system) is Fabric-only
- Server-side-only mods are invisible to players — vanilla and TLauncher clients join
  without installing anything

NeoForge/Forge are supported by the same stack (`SERVER_TYPE` in `.env`) but trail new
versions and would require replacing the auth mod, so Fabric is the default.

## The default mod set

| Mod | Job | Players need it? |
|---|---|---|
| fabric-api | required by most Fabric mods | no |
| easyauth | password authentication | no |
| spark | TPS/ping profiling (powers the Lag page) | no |
| lithium | game-logic optimization | no |
| ferrite-core | memory-usage reduction | no |

## Adding mods

**Panel way (recommended):** Mods page → search Modrinth → **Add** → **Apply changes**.
The search is pre-filtered to Fabric mods compatible with your exact server version.
Watch the **"needs client install"** badge — server-side mods are safe for everyone;
client-required mods mean every friend must install the same mod or they can't join.

**Manual way:** drop a `.jar` into `data/mc/mods/` (Files page → mods → Upload) and
restart the server.

## How auto-update works

Managed mods are pinned by *project slug*, not version, in `.env`:

```
MODRINTH_PROJECTS=fabric-api,easyauth:beta,spark,lithium,ferrite-core
```

A `:beta` (or `:alpha`) suffix widens which release types are accepted for that
project — EasyAuth publishes its 26.x builds as beta on Modrinth, so it needs the
suffix. Without one, only release-typed builds are considered.

Every time the server container (re)starts, the itzg image resolves each slug to the
**newest release compatible with your Minecraft version** and downloads it. So:

- "Update all mods" = restart the server (Mods page → Update all & restart)
- Upgrading Minecraft automatically brings the matching mod builds with it

Manually uploaded jars are yours to update — the resolver doesn't touch them.

## Switching to a modpack later

1. Pick a **Modrinth** modpack (e.g. Adrenaline, Simply Optimized) and note its slug
2. Configuration page → set `MODRINTH_MODPACK` to the slug → Save → Apply
   (take the safety backup — modpacks change world generation!)
3. Every player installs the same modpack client-side (Modrinth App → install pack →
   play). Offline-launcher users need a launcher that supports Modrinth packs, or
   manual mod installation.

To go back: clear `MODRINTH_MODPACK`, Apply. Keep `MODRINTH_PROJECTS` as your
server-side base either way. CurseForge packs also work (`CF_SLUG` env — needs a
CurseForge API key; see the itzg image docs), but Modrinth is smoother.

## Removing a mod

Mods page → managed list → 🗑 (or delete the jar) → Apply. `fabric-api` and `easyauth`
are locked — the auth system depends on them.
