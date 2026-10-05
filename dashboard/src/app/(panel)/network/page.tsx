"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Globe2,
  Plus,
  Network,
  Server,
  Play,
  Square,
  RotateCw,
  Terminal,
  Archive,
  Settings2,
  Copy,
  ArrowRight,
  Layers,
  Check,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Tabs,
  Toggle,
} from "@/components/ui";
import {
  defaultProfile,
  LOADERS,
  proxyCompatible,
  type WorldProfile,
  type NetworkView,
  type ProxySettings,
} from "@/lib/network";

type Draft = Omit<WorldProfile, "id" | "createdAt">;
type Action = { op: string; id?: string; name: string; backup?: string };
const fieldStyle = "flex flex-col gap-1.5 text-xs text-ink2";
export default function NetworkPage() {
  const { data, error, refresh, loading } = useApi<NetworkView>(
    "/api/network",
    5000,
  );
  const [editor, setEditor] = useState<{ draft: Draft; id?: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<WorldProfile | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [proxy, setProxy] = useState<ProxySettings | null>(null);
  const [proxyDirty, setProxyDirty] = useState(false);
  useEffect(() => {
    if (data && !proxyDirty) setProxy(data.proxy);
  }, [data, proxyDirty]);
  const locked = !data || data.managed || data.busy || pending;
  async function saveProfile(draft: Draft, id?: string) {
    setPending(true);
    try {
      await api("/api/network", { body: { op: "save", profile: draft, id } });
      setEditor(null);
      toast("Profile saved. Deploy when ready.", "success");
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  }
  async function act() {
    if (!action) return;
    setPending(true);
    try {
      await api("/api/network", { body: { ...action, confirm: confirmation } });
      setAction(null);
      setConfirmation("");
      await refresh();
      toast("Operation queued; progress appears below");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  }
  const ask = (next: Action) => {
    setConfirmation("");
    setAction(next);
  };
  const running =
    data?.profiles.filter((p) => data.states[p.id]?.running).length ?? 0;
  const routes = data?.profiles.filter((p) => p.route === "proxy") ?? [];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-accent">
            CraftDeck / Infrastructure
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Your worlds. One network.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink2">
            Run independent servers, build a lobby, and give every world room to
            grow.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={locked}
          onClick={() => {
            const n = data?.profiles.length ?? 0;
            setEditor({
              draft: { ...defaultProfile, port: 25570 + n, mapPort: 8101 + n },
            });
          }}
        >
          <Plus size={16} /> Create server
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-crit/40 bg-crit/10 p-4 text-sm text-crit"
        >
          {error}
          <Button className="ml-3" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}
      {data?.managed && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          This installation is managed by Komodo. Deploy network changes through
          homelab-infra; the panel keeps these controls read-only.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        {[
          {
            label: "WORLD SERVERS",
            value: `${running} / ${data?.profiles.length ?? 0}`,
            hint: "running / configured",
            icon: Layers,
          },
          {
            label: "PUBLIC ENTRY",
            value: `:${data?.proxy.port ?? "—"}`,
            hint: data?.states.proxy?.running
              ? "Velocity is running"
              : "Velocity is not running",
            icon: Network,
          },
          {
            label: "ISOLATED BY DESIGN",
            value: `${data?.profiles.reduce((n, p) => n + p.memory, 0) ?? 0} GiB`,
            hint: "configured Java heap across profiles",
            icon: Server,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex justify-between text-[10px] font-semibold tracking-widest text-muted">
              {s.label}
              <s.icon size={15} />
            </div>
            <div className="mt-3 text-2xl font-semibold">{s.value}</div>
            <div className="mt-1 text-xs text-ink2">{s.hint}</div>
          </div>
        ))}
      </div>
      <Card
        title={
          <span className="flex items-center gap-2">
            <Network size={16} className="text-accent" /> Network gateway
          </span>
        }
        actions={
          <Badge
            color={data?.states.proxy?.health === "healthy" ? "good" : "muted"}
          >
            {data?.states.proxy?.health ??
              data?.states.proxy?.status ??
              "Loading"}
          </Badge>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
          <div className="rounded-lg border border-border bg-bg p-5">
            <div className="flex items-center gap-3 text-sm">
              <Globe2 size={20} className="text-info" />
              <span>Players</span>
              <ArrowRight size={16} className="text-muted" />
              <span className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-accent">
                Velocity :{proxy?.port}
              </span>
            </div>
            <div className="ml-8 mt-4 space-y-2 border-l border-border pl-5">
              {routes.length ? (
                routes.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${data?.states[p.id]?.running ? "bg-accent" : "bg-muted"}`}
                    />
                    {p.name}
                    {p.id === proxy?.lobby && (
                      <Badge color="accent">Lobby</Badge>
                    )}
                    <span className="ml-auto text-muted">{p.loader}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">
                  Create a Paper or Folia server to add your first route.
                </p>
              )}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-ink2">
              Players join the lobby, then use{" "}
              <code className="text-ink">/server &lt;server-id&gt;</code>.
              Hostname routes can send them straight to a world. Each server has
              separate inventories unless you install a compatible sync plugin.
            </p>
          </div>
          {proxy && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={fieldStyle}>
                  Public port
                  <Input
                    type="number"
                    value={proxy.port}
                    onChange={(e) => {
                      setProxy({ ...proxy, port: +e.target.value });
                      setProxyDirty(true);
                    }}
                  />
                </label>
                <label className={fieldStyle}>
                  Default lobby
                  <Select
                    value={proxy.lobby}
                    onChange={(v) => {
                      setProxy({ ...proxy, lobby: v });
                      setProxyDirty(true);
                    }}
                    options={[
                      { value: "", label: "Choose a lobby" },
                      ...routes.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </label>
                <label className={fieldStyle}>
                  Network MOTD
                  <Input
                    value={proxy.motd}
                    onChange={(e) => {
                      setProxy({ ...proxy, motd: e.target.value });
                      setProxyDirty(true);
                    }}
                  />
                </label>
                <label className={fieldStyle}>
                  Velocity version
                  <Input
                    value={proxy.version}
                    onChange={(e) => {
                      setProxy({ ...proxy, version: e.target.value });
                      setProxyDirty(true);
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-muted">
                The primary server keeps port {data?.primaryPort ?? 25565}.
                Choose a free gateway port or forward your router’s public 25565
                to this gateway. Applying routing reconnects players.
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={locked || !proxyDirty}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await api("/api/network", {
                        body: { op: "proxy-save", proxy },
                      });
                      setProxyDirty(false);
                      await refresh();
                      toast("Gateway saved", "success");
                    } catch (e) {
                      toast((e as Error).message, "error");
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Save gateway
                </Button>
                <Button
                  variant="primary"
                  disabled={locked || proxyDirty || !proxy.lobby}
                  onClick={() =>
                    ask({ op: "proxy-apply", name: "apply proxy" })
                  }
                >
                  Apply routing
                </Button>
                <Button
                  disabled={locked || !data?.states.proxy?.running}
                  onClick={() => ask({ op: "proxy-stop", name: "stop proxy" })}
                >
                  Stop gateway
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          World servers{" "}
          <span className="ml-2 text-sm text-muted">
            {data?.profiles.length ?? 0}
          </span>
        </h2>
        <Link href="/maps" className="text-xs text-accent">
          Open live maps →
        </Link>
      </div>
      {loading && <p className="text-sm text-muted">Loading your network…</p>}
      {data && !data.profiles.length && (
        <Card>
          <EmptyState
            icon={<Globe2 size={32} />}
            title="A new world starts here"
            hint="Create a lobby, a survival world, or a modded adventure. Profiles are saved first; you decide when to start them."
          />
          <div className="pb-4 text-center">
            <Button
              disabled={locked}
              onClick={() =>
                setEditor({
                  draft: {
                    ...defaultProfile,
                    name: "Lobby",
                    mode: "adventure",
                  },
                })
              }
            >
              Create your lobby
            </Button>
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {data?.profiles.map((p) => {
          const s = data.states[p.id];
          return (
            <section
              key={p.id}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              <div
                className={`h-1 ${p.loader === "FOLIA" ? "bg-info" : p.route === "proxy" ? "bg-accent-deep" : "bg-series3"}`}
              />
              <div className="space-y-4 p-5">
                <div className="flex justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {p.id}
                    </p>
                  </div>
                  <Badge
                    color={
                      s?.health === "healthy"
                        ? "good"
                        : s?.running
                          ? "warn"
                          : "muted"
                    }
                  >
                    {s?.health ?? s?.status ?? "Unknown"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>
                    {p.loader} {p.version}
                  </Badge>
                  <Badge>{p.memory} GiB</Badge>
                  <Badge color={p.route === "proxy" ? "accent" : "info"}>
                    {p.route === "proxy" ? "Proxy route" : `Direct :${p.port}`}
                  </Badge>
                  {p.map !== "none" && <Badge>{p.map}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="text-muted">
                    World seed
                    <div className="mt-1 truncate text-ink2" title={p.seed}>
                      {p.seed || "Random on first start"}
                    </div>
                  </div>
                  <div className="text-muted">
                    Game mode
                    <div className="mt-1 capitalize text-ink2">
                      {p.mode} · {p.difficulty}
                    </div>
                  </div>
                  <div className="text-muted">
                    Backups
                    <div className="mt-1 text-ink2">
                      Every {p.backupHours}h · {p.retentionDays} days
                    </div>
                  </div>
                  <div className="text-muted">
                    Resource pack
                    <div className="mt-1 text-ink2">
                      {p.resourcePack
                        ? p.resourcePackRequired
                          ? "Required download"
                          : "Optional download"
                        : "None"}
                    </div>
                  </div>
                </div>
                {s?.error && (
                  <p className="text-xs text-warn">
                    Container runtime unavailable; status could not be checked.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={locked}
                    onClick={() =>
                      ask({ op: "deploy", id: p.id, name: p.name })
                    }
                  >
                    <Play size={12} />
                    {s?.exists ? "Deploy / apply" : "Deploy"}
                  </Button>
                  <Button
                    title="Restart server"
                    size="sm"
                    disabled={locked || !s?.exists}
                    onClick={() =>
                      ask({ op: "restart", id: p.id, name: p.name })
                    }
                  >
                    <RotateCw size={12} />
                  </Button>
                  <Button
                    title="Stop server"
                    size="sm"
                    disabled={locked || !s?.running}
                    onClick={() => ask({ op: "stop", id: p.id, name: p.name })}
                  >
                    <Square size={12} />
                  </Button>
                  <Button size="sm" onClick={() => setSelected(p)}>
                    <Terminal size={12} />
                    Manage
                  </Button>
                  <Button
                    title="Edit profile"
                    size="sm"
                    disabled={locked}
                    onClick={() => setEditor({ draft: p, id: p.id })}
                  >
                    <Settings2 size={12} />
                  </Button>
                  <Button
                    title="Copy settings into a fresh world"
                    size="sm"
                    disabled={locked}
                    onClick={() =>
                      setEditor({
                        draft: {
                          ...p,
                          name: `${p.name} copy`,
                          seed: "",
                          port: 25570 + data.profiles.length,
                          mapPort: 8101 + data.profiles.length,
                          hostname: "",
                          mapUrl: "",
                        },
                      })
                    }
                  >
                    <Copy size={12} />
                  </Button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {!!data?.jobs.length && (
        <Card title="Operations">
          <div className="space-y-3">
            {data.jobs.slice(0, 6).map((j) => (
              <div
                key={j.id}
                className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                {j.state === "succeeded" ? (
                  <Check size={15} className="mt-1 text-accent" />
                ) : (
                  <RefreshCw
                    size={15}
                    className={`mt-1 text-muted ${["queued", "running"].includes(j.state) ? "animate-spin" : ""}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="capitalize">{j.action}</span>
                    <span className="text-muted">
                      {data.profiles.find((p) => p.id === j.profileId)?.name ??
                        "Gateway"}
                    </span>
                    <Badge
                      color={
                        j.state === "failed"
                          ? "crit"
                          : j.state === "succeeded"
                            ? "good"
                            : "info"
                      }
                    >
                      {j.state}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink2">
                    {j.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          Runtime: {data?.runtime === "apple" ? "Apple container" : "Docker"}.
          New network profiles use verified Minecraft accounts. The primary
          server retains its existing authentication.
        </span>
        <Link href="/features" className="text-accent">
          Explore server capabilities →
        </Link>
      </div>
      <Modal
        open={!!editor}
        onClose={() => !pending && setEditor(null)}
        title={editor?.id ? "Edit server profile" : "Create a world server"}
        wide
      >
        {editor && (
          <ProfileForm
            key={editor.id ?? editor.draft.name}
            draft={editor.draft}
            busy={pending}
            onSave={(draft) => saveProfile(draft, editor.id)}
          />
        )}
      </Modal>
      <Modal
        open={!!action}
        onClose={() => !pending && setAction(null)}
        title={
          action?.op === "proxy-apply"
            ? "Apply gateway routing"
            : `${action?.op ?? ""} · ${action?.name ?? ""}`
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink2">
            {action?.op === "proxy-apply" || action?.op === "proxy-stop"
              ? "Changing the gateway disconnects all players using it. World servers keep running."
              : action?.op === "restore"
                ? "Restore replaces this server’s active files and leaves it stopped. Previous files are retained for recovery."
                : action?.op === "deploy"
                  ? "Deploy downloads the selected runtime and starts this server. Existing worlds receive a verified backup before changes. By starting a Minecraft server you agree to the Minecraft EULA."
                  : "This operation may briefly disconnect players on the affected server. Other world servers keep running."}
          </p>
          {data?.runtime === "apple" && (
            <p className="text-sm text-ink2">
              On this Mac, world operations refresh changing container addresses
              and may restart the gateway. All connected players will need to
              reconnect. If no routed world is ready, the gateway stops; apply
              routing again after starting a world.
            </p>
          )}
          <label className={fieldStyle}>
            Type <strong className="text-ink">{action?.name}</strong> to
            continue
            <Input
              autoFocus
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <Button
            variant="primary"
            busy={pending}
            disabled={confirmation !== action?.name}
            onClick={act}
          >
            Confirm {action?.op}
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Server"}
        wide
      >
        {selected && (
          <ServerTools
            profile={selected}
            locked={!!locked}
            onAction={(a) => {
              setSelected(null);
              ask(a);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
function Group({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-3 text-sm font-medium">
        {title}
      </summary>
      <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
        {children}
      </div>
    </details>
  );
}
function ProfileForm({
  draft,
  busy,
  onSave,
}: {
  draft: Draft;
  busy: boolean;
  onSave: (p: Draft) => void;
}) {
  const [p, setP] = useState(draft);
  function field(
    key: keyof Draft,
    label: string,
    type = "text",
    hint?: string,
  ) {
    return (
      <label className={fieldStyle}>
        {label}
        <Input
          type={type}
          value={String(p[key])}
          onChange={(e) =>
            setP({
              ...p,
              [key]: type === "number" ? +e.target.value : e.target.value,
            })
          }
        />
        {hint && (
          <span className="text-[10px] leading-relaxed text-muted">{hint}</span>
        )}
      </label>
    );
  }
  function select(key: keyof Draft, label: string, values: readonly string[]) {
    return (
      <label className={fieldStyle}>
        {label}
        <Select
          value={String(p[key])}
          onChange={(v) => setP({ ...p, [key]: v })}
          options={values.map((v) => ({ value: v, label: v }))}
        />
      </label>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
      className="space-y-4"
    >
      <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
        <Group title="Identity & runtime" open>
          {field("name", "Server name")}
          <label className={fieldStyle}>
            Runtime
            <Select
              value={p.loader}
              onChange={(v) => {
                const loader = v as WorldProfile["loader"];
                setP({
                  ...p,
                  loader,
                  route: proxyCompatible(loader) ? p.route : "direct",
                  modpack: loader === "MODRINTH" ? p.modpack : "",
                  map: ["VANILLA", "MODRINTH"].includes(loader)
                    ? "none"
                    : p.map,
                });
              }}
              options={LOADERS.map((v) => ({
                value: v,
                label:
                  v === "FOLIA"
                    ? "FOLIA · region threaded"
                    : v === "MODRINTH"
                      ? "MODRINTH · full modpack"
                      : v,
              }))}
            />
          </label>
          {field(
            "version",
            "Exact Minecraft version",
            "text",
            "Choose a version supported by the runtime, mods, and map.",
          )}
          {select("java", "Java runtime", ["8", "17", "21", "25"])}
          {field("loaderVersion", "Loader version / Paper build (optional)")}
          {field(
            "memory",
            "Java heap (GiB)",
            "number",
            "Each server also reserves 1 GiB container headroom.",
          )}
          {p.loader === "FOLIA" && (
            <p className="text-xs leading-relaxed text-info sm:col-span-2">
              Folia ticks independent regions in parallel. Use only plugins
              explicitly supporting Folia. CPU contention, dense player
              clusters, and disk limits can still cause lag.
            </p>
          )}
        </Group>
        <Group title="World generation & gameplay" open>
          {field(
            "seed",
            "World seed",
            "text",
            "Blank generates a random seed. New profiles have separate terrain and player data.",
          )}
          {select("mode", "Game mode", [
            "survival",
            "creative",
            "adventure",
            "spectator",
          ])}
          {select("difficulty", "Difficulty", [
            "peaceful",
            "easy",
            "normal",
            "hard",
          ])}
          {field("maxPlayers", "Player slots", "number")}
          {field("viewDistance", "View distance (chunks)", "number")}
          {field(
            "simulationDistance",
            "Simulation distance (chunks)",
            "number",
          )}
          <Toggle
            checked={p.pvp}
            onChange={(v) => setP({ ...p, pvp: v })}
            label="Player versus player"
          />
          <Toggle
            checked={p.hardcore}
            onChange={(v) => setP({ ...p, hardcore: v })}
            label="Hardcore"
          />
        </Group>
        <Group title="Connection & access" open>
          <label className={fieldStyle}>
            Connection
            <Select
              value={p.route}
              onChange={(v) => setP({ ...p, route: v as "proxy" | "direct" })}
              options={[
                ...(proxyCompatible(p.loader)
                  ? [{ value: "proxy", label: "Through Velocity" }]
                  : []),
                { value: "direct", label: "Direct game port" },
              ]}
            />
          </label>
          {p.route === "direct"
            ? field("port", "Public game port", "number")
            : field(
                "hostname",
                "Optional hostname route",
                "text",
                "Example: survival.example.com. Point DNS to the gateway.",
              )}
          {field(
            "whitelist",
            "Allowed usernames (comma separated)",
            "text",
            "New servers enforce a whitelist and verified accounts. Add players before joining.",
          )}
          <p className="self-end text-xs leading-relaxed text-muted">
            Proxy backends have no public game port. Modded clients must match
            their server’s loader and modpack; direct servers use their own
            port.
          </p>
        </Group>
        <Group title="Mods & modpacks">
          {field(
            "mods",
            "Modrinth mods/plugins",
            "text",
            "Comma-separated slugs; append :version-id to pin a release.",
          )}
          {p.loader === "MODRINTH" && (
            <>
              {field("modpack", "Modrinth pack slug or ID")}
              {field("modpackVersion", "Exact pack version ID")}
            </>
          )}
          <p className="text-xs text-muted sm:col-span-2">
            Upload server JARs and datapacks from Manage → Files. Forge, Fabric,
            and NeoForge content is not interchangeable. Copying profile
            settings creates a fresh world.
          </p>
        </Group>
        <Group title="Live web map">
          {select("map", "Map renderer", ["none", "bluemap", "dynmap"])}
          {field(
            "mapPort",
            "Host map port",
            "number",
            "Bound to 127.0.0.1; publish through your HTTPS reverse proxy.",
          )}
          {field(
            "mapUrl",
            "Browser map URL",
            "url",
            "Example: https://maps.example.com. Used by the Live maps viewer.",
          )}
          <p className="text-xs leading-relaxed text-muted">
            Deploy resolves a compatible release before starting. BlueMap
            requires accepting its asset download in its own config. Player
            visibility and claims depend on renderer settings and compatible
            addons.
          </p>
        </Group>
        <Group title="Resource pack downloads">
          {field("resourcePack", "Direct pack ZIP URL", "url")}
          {field("resourcePackSha1", "SHA-1 checksum")}
          {field("resourcePackPrompt", "Download prompt")}
          <Toggle
            checked={p.resourcePackRequired}
            onChange={(v) => setP({ ...p, resourcePackRequired: v })}
            label="Require the resource pack"
          />
          <p className="text-xs text-muted sm:col-span-2">
            Use a pack built for the client version. Minecraft downloads
            textures, models, sounds, and fonts; resource packs do not install
            client mods.
          </p>
        </Group>
        <Group title="Backup policy">
          {field("backupHours", "Backup every (hours)", "number")}
          {field("retentionDays", "Retain automatic backups (days)", "number")}
        </Group>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-muted">
          Save first, deploy when ready.
        </span>
        <Button type="submit" variant="primary" busy={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
function ServerTools({
  profile: p,
  locked,
  onAction,
}: {
  profile: WorldProfile;
  locked: boolean;
  onAction: (a: Action) => void;
}) {
  const [tab, setTab] = useState("console");
  const [logs, setLogs] = useState("");
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<Array<{ name: string; size: number }>>(
    [],
  );
  const load = async () => {
    try {
      setError("");
      if (tab === "console")
        setLogs(await api<string>(`/api/network?id=${p.id}&kind=logs`));
      if (tab === "backups")
        setBackups(await api(`/api/network?id=${p.id}&kind=backups`));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    const timer =
      tab === "console" ? setInterval(() => void load(), 5000) : null;
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tab, p.id]); // explicit server scope; polling ends when closed
  return (
    <div className="space-y-3">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "console", label: "Console" },
          { id: "backups", label: "Backups" },
          { id: "files", label: "Files" },
        ]}
      />
      {error && <p className="text-xs text-warn">{error}</p>}
      {tab === "console" && (
        <>
          <pre className="h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-3 font-mono text-[11px] text-ink2">
            {logs || "Start the server to see its console."}
          </pre>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const result = await api<string>("/api/network", {
                  body: { op: "command", id: p.id, command },
                });
                setLogs((v) => `${v}\n> ${command}\n${result}`);
                setCommand("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              aria-label="Console command"
              placeholder="list, whitelist add Player, say Hello…"
              className="min-w-0 flex-1"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
            <Button
              type="submit"
              disabled={locked || !command.trim()}
              busy={busy}
            >
              Run
            </Button>
          </form>
        </>
      )}
      {tab === "backups" && (
        <>
          <p className="text-xs text-ink2">
            Manual snapshots briefly stop this server for a consistent backup.
            Scheduled backups use its dedicated sidecar.
          </p>
          <Button
            disabled={locked}
            onClick={() => onAction({ op: "snapshot", id: p.id, name: p.name })}
          >
            <Archive size={14} />
            Take snapshot
          </Button>
          <div className="max-h-80 space-y-2 overflow-auto">
            {backups.map((b) => (
              <div
                key={b.name}
                className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs"
              >
                <span className="min-w-0 flex-1 break-all">
                  {b.name}
                  <span className="ml-2 text-muted">
                    {(b.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={locked}
                  onClick={() =>
                    onAction({
                      op: "restore",
                      id: p.id,
                      name: p.name,
                      backup: b.name,
                    })
                  }
                >
                  Restore
                </Button>
              </div>
            ))}
            {!backups.length && <EmptyState title="No snapshots yet" />}
          </div>
        </>
      )}
      {tab === "files" && <ProfileFiles id={p.id} locked={locked} />}
    </div>
  );
}
function ProfileFiles({ id, locked }: { id: string; locked: boolean }) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<
    Array<{ name: string; directory: boolean; link: boolean }>
  >([]);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (next: string) => {
    setBusy(true);
    try {
      const r = await api<{ entries?: typeof entries; content?: string }>(
        `/api/network/files?id=${id}&path=${encodeURIComponent(next)}`,
      );
      setPath(next);
      setEntries(r.entries ?? []);
      setContent(r.content ?? null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load("");
  }, [id]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Stop the server before editing configs or uploading mod/plugin JARs and
        datapack ZIPs.
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!path || busy}
          onClick={() => void load(path.split("/").slice(0, -1).join("/"))}
        >
          ↑ Up
        </Button>
        <span className="truncate font-mono text-xs">/{path}</span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-warn">
          {error}
        </p>
      )}
      {content !== null ? (
        <>
          <textarea
            aria-label="File contents"
            spellCheck={false}
            className="h-72 w-full rounded-lg border border-border bg-bg p-3 font-mono text-xs"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button
            disabled={locked}
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/network/files", {
                  body: { id, path, content },
                });
                toast("File saved", "success");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save file
          </Button>
        </>
      ) : (
        <>
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            {entries.map((e) => (
              <button
                key={e.name}
                disabled={e.link || busy}
                className="flex w-full gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-surface2 disabled:opacity-50"
                onClick={() =>
                  void load([path, e.name].filter(Boolean).join("/"))
                }
              >
                <FolderOpen
                  size={13}
                  className={e.directory ? "text-accent" : "text-muted"}
                />
                {e.name}
                {e.link && " (symlink)"}
              </button>
            ))}
          </div>
          <label className={fieldStyle}>
            Upload into /
            {path || " (open mods, plugins, or world/datapacks first)"}
            <input
              type="file"
              accept=".jar,.zip"
              disabled={locked || busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  const form = new FormData();
                  form.set("id", id);
                  form.set("path", [path, file.name].filter(Boolean).join("/"));
                  form.set("file", file);
                  const res = await fetch("/api/network/files", {
                    method: "POST",
                    body: form,
                  });
                  const result = await res.json();
                  if (!res.ok) throw new Error(result.error || "Upload failed");
                  await load(path);
                  toast("Uploaded", "success");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
