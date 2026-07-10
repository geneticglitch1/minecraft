"use client";

import { useMemo, useState } from "react";
import { Stethoscope, Wifi } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Badge, Tabs, EmptyState, Modal } from "@/components/ui";
import { TimeSeriesChart, Sparkline, type Point } from "@/components/charts";
import { fmtBytes } from "@/lib/format";

type MetricRow = {
  bucket: number;
  cpu: number | null;
  mem_used: number | null;
  mem_limit: number | null;
  net_rx: number | null;
  net_tx: number | null;
  tps: number | null;
  mspt: number | null;
  players: number | null;
  disk_used: number | null;
  disk_free: number | null;
};

type LagData = {
  tps: number | null;
  mspt: number | null;
  cpu: number | null;
  serverHealthy: boolean;
  verdict: "no-data" | "server-lagging" | "player-connections" | "all-good";
  players: Array<{
    name: string;
    ping: number | null;
    verdict: string;
    history: Array<{ ts: number; ping: number }>;
  }>;
};

const RANGES = [
  { id: "1h", label: "1 hour" },
  { id: "6h", label: "6 hours" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
];

const VERDICTS: Record<LagData["verdict"], { badge: "good" | "warn" | "crit" | "muted"; title: string; hint: string }> = {
  "all-good": {
    badge: "good",
    title: "Everything looks healthy",
    hint: "The server is ticking at full speed and every player's connection is fine.",
  },
  "server-lagging": {
    badge: "crit",
    title: "The server itself is lagging",
    hint: "Tick rate is below target — everyone experiences this equally. Check CPU/memory, heavy redstone/farms, or too many loaded chunks.",
  },
  "player-connections": {
    badge: "warn",
    title: "Server is fine — some connections are not",
    hint: "The server is ticking normally. The players flagged below have high ping, so lag is on their network path, not your machine.",
  },
  "no-data": {
    badge: "muted",
    title: "No data yet",
    hint: "Start the server and give the sampler a minute to collect TPS and ping data.",
  },
};

export default function PerformancePage() {
  const [range, setRange] = useState("1h");
  const { data: rows } = useApi<MetricRow[]>(`/api/metrics?range=${range}`, 30000);
  const { data: lag, refresh: refreshLag } = useApi<LagData>("/api/lag", 30000);
  const [report, setReport] = useState<string | null>(null);
  const [busyReport, setBusyReport] = useState(false);

  const pts = useMemo(() => {
    const make = (key: keyof MetricRow): Point[] => (rows ?? []).map((r) => ({ ts: r.bucket, v: r[key] as number | null }));
    // network counters are cumulative; convert to per-second rates
    const rates = (key: "net_rx" | "net_tx"): Point[] => {
      const out: Point[] = [];
      const data = rows ?? [];
      for (let i = 1; i < data.length; i++) {
        const dv = (data[i][key] ?? 0) - (data[i - 1][key] ?? 0);
        const dt = (data[i].bucket - data[i - 1].bucket) / 1000;
        out.push({ ts: data[i].bucket, v: dv >= 0 && dt > 0 ? dv / dt : null });
      }
      return out;
    };
    return { make, rates };
  }, [rows]);

  const runHealthReport = async () => {
    setBusyReport(true);
    try {
      const d = await api<{ report: string }>("/api/lag/healthreport", { method: "POST" });
      setReport(d.report);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyReport(false);
    }
  };

  const verdict = VERDICTS[lag?.verdict ?? "no-data"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Performance &amp; Lag</h1>
          <p className="mt-0.5 text-xs text-ink2">Server tick health, resource usage, and who's actually lagging</p>
        </div>
        <Tabs tabs={RANGES} active={range} onChange={setRange} />
      </div>

      {/* lag verdict */}
      <Card
        title="Lag diagnosis"
        actions={
          <Button size="sm" onClick={runHealthReport} busy={busyReport}>
            <Stethoscope size={13} /> Full health report
          </Button>
        }
      >
        <div className="flex flex-wrap items-start gap-4">
          <Badge color={verdict.badge}>{verdict.title}</Badge>
          <p className="min-w-64 flex-1 text-xs leading-relaxed text-ink2">{verdict.hint}</p>
          <div className="flex gap-4 text-center">
            {[
              ["TPS", lag?.tps != null ? lag.tps.toFixed(1) : "—"],
              ["MSPT", lag?.mspt != null ? `${lag.mspt.toFixed(1)} ms` : "—"],
              ["CPU", lag?.cpu != null ? `${lag.cpu.toFixed(0)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
                <div className="text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* per-player connections */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs font-medium text-ink2">Player connections (last hour)</div>
          {!lag || lag.players.length === 0 ? (
            <div className="text-xs text-muted">Nobody online right now.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lag.players.map((p) => (
                <div key={p.name} className="rounded-lg border border-border bg-surface2 p-3">
                  <div className="flex items-center gap-2">
                    <Wifi
                      size={13}
                      className={
                        p.verdict === "bad-connection"
                          ? "text-crit"
                          : p.verdict === "weak-connection"
                            ? "text-warn"
                            : "text-good"
                      }
                    />
                    <span className="font-mono text-sm font-medium">{p.name}</span>
                    <span className="ml-auto text-sm font-semibold">
                      {p.ping !== null ? `${p.ping} ms` : "—"}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Sparkline
                      points={p.history.map((h) => ({ ts: h.ts, v: h.ping }))}
                      color={
                        p.verdict === "bad-connection"
                          ? "var(--color-crit)"
                          : p.verdict === "weak-connection"
                            ? "var(--color-warn)"
                            : "var(--color-series2)"
                      }
                      height={28}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-muted">
                    {p.verdict === "bad-connection"
                      ? "Their connection is struggling — it's not the server."
                      : p.verdict === "weak-connection"
                        ? "Somewhat high ping — their network, not the server."
                        : p.verdict === "good"
                          ? "Healthy connection."
                          : "No ping data yet."}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* charts — one measure per chart (never dual-axis) */}
      {!rows || rows.length < 2 ? (
        <Card>
          <EmptyState
            title="Collecting metrics…"
            hint="The sampler stores a data point every 10 seconds while the panel runs."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Tick rate (TPS)">
            <TimeSeriesChart
              series={[{ name: "TPS", color: "var(--color-series2)", points: pts.make("tps") }]}
              yMax={20}
              height={190}
            />
          </Card>
          <Card title="Tick duration (MSPT)">
            <TimeSeriesChart
              series={[{ name: "MSPT", color: "var(--color-series3)", points: pts.make("mspt") }]}
              unit=" ms"
              height={190}
            />
          </Card>
          <Card title="CPU usage">
            <TimeSeriesChart
              series={[{ name: "CPU", color: "var(--color-series1)", points: pts.make("cpu") }]}
              unit="%"
              height={190}
            />
          </Card>
          <Card title="Memory">
            <TimeSeriesChart
              series={[{ name: "Used", color: "var(--color-series1)", points: pts.make("mem_used") }]}
              height={190}
              formatValue={(v) => fmtBytes(v)}
            />
          </Card>
          <Card title="Network throughput">
            <TimeSeriesChart
              series={[
                { name: "Down", color: "var(--color-series1)", points: pts.rates("net_rx") },
                { name: "Up", color: "var(--color-series2)", points: pts.rates("net_tx") },
              ]}
              height={190}
              formatValue={(v) => `${fmtBytes(v)}/s`}
            />
          </Card>
          <Card title="Players online">
            <TimeSeriesChart
              series={[{ name: "Players", color: "var(--color-series3)", points: pts.make("players") }]}
              height={190}
              formatValue={(v) => String(Math.round(v))}
            />
          </Card>
        </div>
      )}

      {/* spark health report modal */}
      <Modal open={report !== null} onClose={() => setReport(null)} title="spark health report" wide>
        <pre className="scroll-slim max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-[#070a0e] p-3 font-mono text-[11px] leading-relaxed text-ink2">
          {report}
        </pre>
      </Modal>
    </div>
  );
}
