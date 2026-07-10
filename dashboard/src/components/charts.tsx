"use client";

import { useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/format";

/**
 * SVG chart components following the dataviz method: recessive grid, thin
 * 2px lines, muted axis ink, hover crosshair + tooltip, legend + direct
 * labels when there are ≥2 series, text in ink tokens (never series color).
 */

export type Point = { ts: number; v: number | null };
export type Series = { name: string; color: string; points: Point[] };

/* ── mini sparkline (stat tiles) ───────────────────────────────────── */

export function Sparkline({
  points,
  color = "var(--color-series1)",
  height = 36,
  yMax,
}: {
  points: Point[];
  color?: string;
  height?: number;
  yMax?: number;
}) {
  const width = 220;
  const valid = points.filter((p) => p.v !== null) as Array<{ ts: number; v: number }>;
  if (valid.length < 2) {
    return <div className="h-9 text-[11px] leading-9 text-muted">collecting data…</div>;
  }
  const xs = valid.map((p) => p.ts);
  const ys = valid.map((p) => p.v);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yTop = yMax ?? (Math.max(...ys) * 1.1 || 1);
  const px = (t: number) => ((t - xMin) / Math.max(xMax - xMin, 1)) * width;
  const py = (v: number) => height - 2 - (v / yTop) * (height - 6);
  const d = valid.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.ts).toFixed(1)},${py(p.v).toFixed(1)}`).join(" ");
  const area = `${d} L${px(xMax).toFixed(1)},${height} L${px(xMin).toFixed(1)},${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── full time-series chart ────────────────────────────────────────── */

export function TimeSeriesChart({
  series,
  height = 200,
  unit = "",
  yMax: yMaxProp,
  formatValue = (v: number) => `${Math.round(v * 10) / 10}${unit}`,
}: {
  series: Series[];
  height?: number;
  unit?: string;
  yMax?: number;
  formatValue?: (v: number) => string;
}) {
  const width = 760;
  const pad = { l: 44, r: 70, t: 10, b: 22 };
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null); // hovered timestamp

  const { xMin, xMax, yMax, hasData } = useMemo(() => {
    const all = series.flatMap((s) => s.points.filter((p) => p.v !== null));
    if (all.length < 2) return { xMin: 0, xMax: 1, yMax: 1, hasData: false };
    const xs = series.flatMap((s) => s.points.map((p) => p.ts));
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMax: yMaxProp ?? (Math.max(...all.map((p) => p.v as number)) * 1.15 || 1),
      hasData: true,
    };
  }, [series, yMaxProp]);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>
        Not enough data yet — the sampler records a point every 10 seconds.
      </div>
    );
  }

  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const px = (t: number) => pad.l + ((t - xMin) / Math.max(xMax - xMin, 1)) * plotW;
  const py = (v: number) => pad.t + plotH - (Math.min(v, yMax) / yMax) * plotH;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + (xMax - xMin) * f);

  // nearest points for tooltip
  const hoverData =
    hover === null
      ? null
      : series
          .map((s) => {
            let best: Point | null = null;
            for (const p of s.points) {
              if (p.v === null) continue;
              if (!best || Math.abs(p.ts - hover) < Math.abs(best.ts - hover)) best = p;
            }
            return { name: s.name, color: s.color, point: best };
          })
          .filter((h) => h.point !== null);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const fx = (e.clientX - rect.left) / rect.width; // 0..1 across rendered width
    const svgX = fx * width;
    if (svgX < pad.l || svgX > width - pad.r) return setHover(null);
    setHover(xMin + ((svgX - pad.l) / plotW) * (xMax - xMin));
  };

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {/* recessive grid */}
        {gridYs.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={py(v)} y2={py(v)} stroke="var(--color-border)" strokeWidth="1" />
            <text x={pad.l - 6} y={py(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-muted)">
              {formatValue(v)}
            </text>
          </g>
        ))}
        {timeTicks.map((t) => (
          <text key={t} x={px(t)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
            {fmtTime(t)}
          </text>
        ))}

        {/* series lines (2px) + direct labels at line ends */}
        {series.map((s) => {
          const valid = s.points.filter((p) => p.v !== null) as Array<{ ts: number; v: number }>;
          if (valid.length < 2) return null;
          const d = valid
            .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.ts).toFixed(1)},${py(p.v).toFixed(1)}`)
            .join(" ");
          const last = valid[valid.length - 1];
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {series.length > 1 && (
                <text
                  x={width - pad.r + 6}
                  y={py(last.v) + 3}
                  fontSize="10"
                  fill="var(--color-ink2)"
                >
                  {s.name}
                </text>
              )}
            </g>
          );
        })}

        {/* hover crosshair + markers */}
        {hover !== null && hoverData && (
          <g>
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1={pad.t}
              y2={pad.t + plotH}
              stroke="var(--color-muted)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {hoverData.map((h) => (
              <circle
                key={h.name}
                cx={px(h.point!.ts)}
                cy={py(h.point!.v as number)}
                r="4"
                fill={h.color}
                stroke="var(--color-surface)"
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hover !== null && hoverData && hoverData.length > 0 && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: `${Math.min(Math.max((px(hover) / width) * 100, 8), 78)}%`,
          }}
        >
          <div className="mb-0.5 font-medium text-ink2">{fmtTime(hoverData[0].point!.ts)}</div>
          {hoverData.map((h) => (
            <div key={h.name} className="flex items-center gap-1.5 text-ink">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: h.color }} />
              <span className="text-ink2">{h.name}</span>
              <span className="ml-auto pl-3 font-medium">{formatValue(h.point!.v as number)}</span>
            </div>
          ))}
        </div>
      )}

      {/* legend (≥2 series) */}
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-3 pl-11">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-ink2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── horizontal usage bar (disk etc.) ──────────────────────────────── */

export function UsageBar({
  used,
  total,
  label,
  format,
}: {
  used: number;
  total: number;
  label?: string;
  format: (v: number) => string;
}) {
  const frac = total > 0 ? Math.min(used / total, 1) : 0;
  const color = frac > 0.9 ? "var(--color-crit)" : frac > 0.75 ? "var(--color-warn)" : "var(--color-series1)";
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-ink2">
          <span>{label}</span>
          <span>
            {format(used)} / {format(total)}
          </span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-surface3">
        <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: color }} />
      </div>
    </div>
  );
}
