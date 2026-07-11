"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, Square, RotateCw, HardDrive, Globe2, Cuboid, Map } from "lucide-react";
import { api, useApi, useSSE, toast } from "@/lib/api";
import { Card, StatTile, Button, Badge, EmptyState } from "@/components/ui";
import { Sparkline, UsageBar, type Point } from "@/components/charts";
import { QuickControls } from "@/components/quickcontrols";
import { fmtBytes, fmtDuration, timeAgo, fmtCountdown } from "@/lib/format";

type ServerData = {
  dockerAvailable: boolean;
  container: { exists: boolean; running: boolean; status: string; health?: string };
  players: { online: number; max: number; names: string[] };
  version: string | null;
  serverType: string | null;
  metrics: Record<string, number | null> | null;
  pendingApprovals: number;
  map: { available: boolean; port: number };
  world: { seed: string | null; sizeBytes: number | null; dimensions: string[]; levelName: string | null };
  uptimeMs: number | null;
};

type MetricRow = {
  bucket: number;
  cpu: number | null;
  mem_used: number | null;
  mem_limit: number | null;
  tps: number | null;
  players: number | null;
  disk_used: number | null;
  disk_free: number | null;
};

type ActivityRow = { id: number; ts: number; type: string; player: string | null; detail: string | null };

type ApprovedRow = { username: string; status: string; window_expires_at: number | null };

const ACTIVITY_LABELS: Record<string, { label: string; color: "good" | "warn" | "crit" | "info" | "muted" }> = {
  join: { label: "joined", color: "good" },
  leave: { label: "left", color: "muted" },
  connect: { label: "connecting", color: "info" },
  register: { label: "registered", color: "good" },
  approve: { label: "approved", color: "info" },
  expire: { label: "window expired", color: "warn" },
  revoke: { label: "revoked", color: "crit" },
  server_online: { label: "server online", color: "good" },
  server_stopping: { label: "server stopping", color: "warn" },
  backup: { label: "backup", color: "info" },
  restore: { label: "restore", color: "warn" },
  power: { label: "power", color: "muted" },
  console: { label: "console", color: "muted" },
  world_reset: { label: "world reset", color: "crit" },
  blocked: { label: "blocked", color: "crit" },
  ban: { label: "banned", color: "crit" },
  ban_ip: { label: "IP banned", color: "crit" },
  pardon: { label: "unbanned", color: "info" },
  pardon_ip: { label: "IP unbanned", color: "info" },
  kick_all: { label: "kicked all", color: "warn" },
  admin: { label: "admin", color: "info" },
  whitelist_heal: { label: "whitelist re-synced", color: "warn" },
  password_reset: { label: "password reset", color: "info" },
};

export default function OverviewPage() {
  const { data: server, refresh } = useApi<ServerData>("/api/server", 10000);
  const { data: metricRows, refresh: refreshMetrics } = useApi<MetricRow[]>("/api/metrics?range=1h", 30000);
  const { data: activity, refresh: refreshActivity } = useApi<ActivityRow[]>("/api/activity?limit=14", 20000);
  const { data: approvedData, refresh: refreshApproved } = useApi<{ approved: ApprovedRow[] }>(
    "/api/approved",
    15000
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  useSSE("/api/stream/events", {
    "mc-event": () => {
      void refreshActivity();
      void refreshApproved();
    },
    metrics: () => forceTick((x) => x + 1),
  });

  const power = async (action: "start" | "stop" | "restart") => {
    setBusyAction(action);
    try {
      await api("/api/server/power", { body: { action } });
      toast(`Server ${action} requested`, "success");
      setTimeout(() => void refresh(), 1500);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const running = server?.container.running ?? false;
  const m = server?.metrics;
  const points = (key: keyof MetricRow): Point[] =>
    (metricRows ?? []).map((r) => ({ ts: r.bucket, v: r[key] as number | null }));

  const pending = (approvedData?.approved ?? []).filter((a) => a.status === "pending");

  return (
    <div className="space-y-4">
      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Overview</h1>
          <p className="mt-0.5 text-xs text-ink2">
            {server?.serverType ?? "Fabric"} · Minecraft {server?.version ?? "…"}
            {running && server?.uptimeMs != null && <> · up {fmtDuration(server.uptimeMs)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => power("start")}
            busy={busyAction === "start"}
            disabled={running || !server?.dockerAvailable}
          >
            <Play size={13} /> Start
          </Button>
          <Button
            size="sm"
            onClick={() => power("restart")}
            busy={busyAction === "restart"}
            disabled={!running}
          >
            <RotateCw size={13} /> Restart
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => power("stop")}
            busy={busyAction === "stop"}
            disabled={!running}
          >
            <Square size={13} /> Stop
          </Button>
        </div>
      </div>

      {!server?.dockerAvailable && server && (
        <div className="rounded-xl border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">
          Docker is unreachable from the panel. If you're running the dashboard outside the compose stack,
          server control and metrics are unavailable.
        </div>
      )}

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="TPS"
          value={m?.tps != null ? Number(m.tps).toFixed(1) : "—"}
          sub="target 20.0"
          accent={m?.tps != null ? (Number(m.tps) >= 18 ? "good" : Number(m.tps) >= 15 ? "warn" : "crit") : undefined}
        >
          <Sparkline points={points("tps")} yMax={20} color="var(--color-series2)" />
        </StatTile>
        <StatTile label="CPU" value={m?.cpu != null ? `${Number(m.cpu).toFixed(0)}%` : "—"} sub="of one core × cores">
          <Sparkline points={points("cpu")} />
        </StatTile>
        <StatTile
          label="Memory"
          value={m?.mem_used != null ? fmtBytes(Number(m.mem_used)) : "—"}
          sub={m?.mem_limit ? `limit ${fmtBytes(Number(m.mem_limit))}` : undefined}
        >
          <Sparkline points={points("mem_used")} yMax={m?.mem_limit ? Number(m.mem_limit) : undefined} />
        </StatTile>
        <StatTile
          label="Players"
          value={`${server?.players.online ?? 0}${server?.players.max ? ` / ${server.players.max}` : ""}`}
          sub={server?.players.names.join(", ") || "nobody online"}
        >
          <Sparkline points={points("players")} color="var(--color-series3)" />
        </StatTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* activity feed */}
        <Card title="Recent activity">
          {!activity || activity.length === 0 ? (
            <EmptyState title="No activity yet" hint="Joins, registrations and server events show up here." />
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => {
                const meta = ACTIVITY_LABELS[a.type] ?? { label: a.type, color: "muted" as const };
                return (
                  <li key={a.id} className="flex items-center gap-2.5 text-sm">
                    <Badge color={meta.color}>{meta.label}</Badge>
                    <span className="truncate text-ink">
                      {a.player && <span className="font-medium">{a.player} </span>}
                      <span className="text-ink2">{a.detail}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(a.ts)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {/* pending registrations */}
          {pending.length > 0 && (
            <Card title="Waiting to register">
              <ul className="space-y-2">
                {pending.map((p) => (
                  <li key={p.username} className="flex items-center gap-2 text-sm">
                    <Badge color="warn">pending</Badge>
                    <span className="font-medium">{p.username}</span>
                    <span className="ml-auto font-mono text-xs text-warn">
                      {p.window_expires_at ? fmtCountdown(p.window_expires_at) : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted">
                They must join and <code>/register &lt;password&gt; &lt;password&gt;</code> before the timer runs
                out. Manage in{" "}
                <Link href="/access" className="text-accent underline">
                  Access &amp; Auth
                </Link>
                .
              </p>
            </Card>
          )}

          {/* admin quick controls */}
          <QuickControls running={running} />

          {/* world + disk */}
          <Card title="World & storage">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Cuboid size={15} className="text-muted" />
                <span className="text-ink2">World</span>
                <span className="ml-auto font-medium">
                  {server?.world.levelName ?? "world"} · {fmtBytes(server?.world.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Globe2 size={15} className="text-muted" />
                <span className="text-ink2">Dimensions</span>
                <span className="ml-auto font-medium">
                  {server?.world.dimensions.length ? server.world.dimensions.join(" · ") : "not generated yet"}
                </span>
              </div>
              {server?.world.seed && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-ink2">Seed</span>
                  <span className="ml-auto font-mono text-xs">{server.world.seed}</span>
                </div>
              )}
              {server?.map.available && (
                <a
                  href={`http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:${server.map.port}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-accent-deep/40 bg-accent/10 px-3 py-2 text-sm text-accent hover:bg-accent/20"
                >
                  <Map size={15} />
                  <span className="font-medium">Open the live world map</span>
                  <span className="ml-auto text-xs">BlueMap ↗</span>
                </a>
              )}
              <div className="pt-1">
                {m?.disk_used != null && m?.disk_free != null ? (
                  <UsageBar
                    used={Number(m.disk_used)}
                    total={Number(m.disk_used) + Number(m.disk_free)}
                    label="Host disk"
                    format={fmtBytes}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <HardDrive size={13} /> disk stats unavailable
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
