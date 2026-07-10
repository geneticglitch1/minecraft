export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 30_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtCountdown(untilTs: number): string {
  const left = untilTs - Date.now();
  if (left <= 0) return "0:00";
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}
