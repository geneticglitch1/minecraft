import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Cpu,
  Globe2,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
const groups = [
  {
    title: "Worlds & networks",
    icon: Globe2,
    items: [
      [
        "Independent world servers",
        "Built in",
        "Concurrent profiles with separate seeds, versions, Java runtimes, mods, configs, player data, and backups.",
      ],
      [
        "Lobby & server switching",
        "Built in",
        "Velocity gateway, default lobby, fallback routes, and hostname routing for Paper/Folia. Use /server to switch compatible servers.",
      ],
      [
        "Several worlds inside one server",
        "Addon",
        "Multiverse-style plugins or modded dimensions. These share one runtime, so use separate profiles for incompatible modpacks.",
      ],
      [
        "Cross-server inventories & chat",
        "Addon",
        "A compatible sync plugin and shared database can connect inventories, economies, permissions, and chat. Decide what each game mode should share.",
      ],
    ],
  },
  {
    title: "Performance & scale",
    icon: Cpu,
    items: [
      [
        "Region-based ticking",
        "Runtime option",
        "Folia runs independent regions in parallel. It needs suitable hardware and Folia-aware plugins; crowded regions can still lag.",
      ],
      [
        "Fabric / Forge / NeoForge / Quilt",
        "Built in",
        "Dedicated runtime profiles preserve mod compatibility. Match the Java release and client modpack to the selected server version.",
      ],
      [
        "Profiling & tuning",
        "Primary panel",
        "Performance charts and spark diagnostics remain in the primary server panel. Tune view/simulation distances per network profile.",
      ],
      [
        "Chunk pregeneration",
        "Addon",
        "Pregenerate a bounded play area with a compatible tool to reduce exploration spikes. Budget disk space and schedule it outside peak hours.",
      ],
    ],
  },
  {
    title: "Maps & client experience",
    icon: Sparkles,
    items: [
      [
        "BlueMap / Dynmap",
        "Integration",
        "Compatible release resolution, isolated renderer ports, and an embedded viewer for your HTTPS map URL. Rendering runs on the server.",
      ],
      [
        "Resource pack downloads",
        "Built in",
        "Per-server ZIP URL, SHA-1, download prompt, and required/optional mode. Textures, models, sounds, and fonts; client mods are separate.",
      ],
      [
        "Claims, towns & economies",
        "Addon",
        "Install compatible protection, town, economy, shop, and map-marker plugins. Plugin compatibility depends on the runtime and version.",
      ],
      [
        "Bedrock crossplay",
        "Addon",
        "Geyser and optionally Floodgate can bridge supported clients. Configure identity handling and a separate UDP port; this panel does not deploy it automatically.",
      ],
    ],
  },
  {
    title: "Safety & operations",
    icon: Shield,
    items: [
      [
        "Backups & recovery",
        "Built in",
        "Per-server backup sidecars, retention policies, verified cold snapshots, and staged restores that retain previous data.",
      ],
      [
        "Access & isolation",
        "Built in",
        "New profiles require verified accounts and a whitelist. Proxy backends are private and use a forwarding secret. Primary offline authentication remains separate.",
      ],
      [
        "Console & file management",
        "Built in",
        "Profile-specific commands, log tails, stopped-server config editing, mod/plugin uploads, and datapack uploads.",
      ],
      [
        "Remote backups & disaster recovery",
        "External setup",
        "Replicate archives to another host or object store and test restores. Local backups do not survive loss of the host disk.",
      ],
    ],
  },
  {
    title: "Gameplay extensions",
    icon: Boxes,
    items: [
      [
        "Custom terrain & dimensions",
        "Addon",
        "World-generation datapacks and mods, structure packs, biomes, and dimensions. Install generation content before exploring new terrain.",
      ],
      [
        "Minigames & events",
        "Addon",
        "Create separate arena profiles for PvP, parkour, creative, adventure, or seasonal worlds and route through the gateway.",
      ],
      [
        "Voice chat & Discord",
        "Addon",
        "Compatible voice mods need an extra UDP port. The primary panel already supports Discord operational alerts; in-game bridges need plugins.",
      ],
      [
        "Permissions, moderation & rollback",
        "Addon",
        "Use compatible permissions, audit, anti-cheat, and rollback tools. Folia requires explicit support; a Paper plugin label is insufficient.",
      ],
    ],
  },
  {
    title: "Advanced infrastructure",
    icon: Wrench,
    items: [
      [
        "Custom domains & ingress",
        "External setup",
        "DNS/SRV records, HTTPS map reverse proxies, and Minecraft-aware TCP protection can provide a consistent entry point.",
      ],
      [
        "Version translation",
        "Addon",
        "ViaVersion-family plugins translate supported protocol differences. They cannot make incompatible client modpacks interchangeable.",
      ],
      [
        "Multiple physical hosts",
        "External setup",
        "A private network and per-host orchestration can spread servers across machines. This implementation manages one Docker host.",
      ],
      [
        "Maintenance & automation",
        "Primary panel",
        "The existing scheduler, metrics, notifications, and access flows target the primary server. Network profiles have independent automatic backups.",
      ],
    ],
  },
];
export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-accent">
          CraftDeck / Possibilities
        </div>
        <h1 className="text-2xl font-bold">Build the server you want.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink2">
          A practical capability guide, from a small survival world to a network
          of game modes. The labels show what this panel manages and what needs
          additional software or infrastructure.
        </p>
        <Link
          href="/network"
          className="mt-4 inline-flex items-center gap-2 text-sm text-accent"
        >
          Open your network
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => (
          <Card
            key={g.title}
            title={
              <span className="flex items-center gap-2">
                <g.icon size={16} className="text-accent" />
                {g.title}
              </span>
            }
          >
            <div className="space-y-5">
              {g.items.map(([title, status, body]) => (
                <div key={title}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{title}</h3>
                    <Badge
                      color={
                        status === "Built in"
                          ? "good"
                          : status === "Addon"
                            ? "muted"
                            : "info"
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-ink2">{body}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">
        Compatibility changes by Minecraft release. Verify the exact mod/plugin
        versions and test changes on a fresh profile before moving players.
      </p>
      <div className="flex flex-wrap gap-4 text-xs text-accent">
        <a
          href="https://docs.papermc.io/folia/"
          target="_blank"
          rel="noreferrer"
        >
          Folia documentation ↗
        </a>
        <a
          href="https://docs.papermc.io/velocity/server-compatibility/"
          target="_blank"
          rel="noreferrer"
        >
          Velocity compatibility ↗
        </a>
        <a
          href="https://bluemap.bluecolored.de/wiki/"
          target="_blank"
          rel="noreferrer"
        >
          BlueMap documentation ↗
        </a>
        <a
          href="https://docker-minecraft-server.readthedocs.io/"
          target="_blank"
          rel="noreferrer"
        >
          Runtime documentation ↗
        </a>
      </div>
    </div>
  );
}
