"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Gauge,
  TerminalSquare,
  Users,
  ShieldCheck,
  Activity,
  Package,
  Archive,
  FolderOpen,
  Sliders,
  CalendarClock,
  Settings,
  Bell,
  LogOut,
  CircleDot,
} from "lucide-react";
import { api, useApi, useSSE, toast } from "@/lib/api";
import { Badge, Toaster } from "@/components/ui";
import { timeAgo } from "@/lib/format";

const NAV = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/console", label: "Console", icon: TerminalSquare },
  { href: "/players", label: "Players", icon: Users },
  { href: "/access", label: "Access & Auth", icon: ShieldCheck },
  { href: "/performance", label: "Performance", icon: Activity },
  { href: "/mods", label: "Mods", icon: Package },
  { href: "/backups", label: "Backups", icon: Archive },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/config", label: "Configuration", icon: Sliders },
  { href: "/schedules", label: "Schedules", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

type ServerSummary = {
  container: { running: boolean; status: string };
  players: { online: number; max: number };
  pendingApprovals: number;
};

type NotificationRow = {
  id: number;
  ts: number;
  level: "info" | "success" | "warn" | "error";
  title: string;
  body: string | null;
  read: number;
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: server, refresh } = useApi<ServerSummary>("/api/server", 15000);
  const { data: me } = useApi<{ username: string; mustChange: boolean }>("/api/auth/me");
  const [running, setRunning] = useState<boolean | null>(null);
  const [players, setPlayers] = useState<number | null>(null);

  useSSE("/api/stream/events", {
    metrics: (m) => {
      const d = m as { running: boolean; players: number | null };
      setRunning(d.running);
      if (d.players !== null) setPlayers(d.players);
    },
    notification: (n) => {
      const d = n as NotificationRow;
      toast(d.title, d.level === "error" ? "error" : d.level === "warn" ? "warn" : d.level);
      setUnreadBump((x) => x + 1);
    },
  });

  const [unreadBump, setUnreadBump] = useState(0);
  const isRunning = running ?? server?.container.running ?? false;
  const playerCount = players ?? server?.players.online ?? 0;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-52 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <svg viewBox="0 0 32 32" className="h-7 w-7 rounded-md">
            <rect width="32" height="32" rx="7" fill="#0b0f14" />
            <rect x="7" y="7" width="8" height="8" fill="#4ade80" />
            <rect x="17" y="7" width="8" height="8" fill="#199e70" />
            <rect x="7" y="17" width="8" height="8" fill="#199e70" />
            <rect x="17" y="17" width="8" height="8" fill="#166534" />
          </svg>
          <div>
            <div className="text-sm font-bold leading-none">CraftDeck</div>
            <div className="mt-0.5 text-[10px] text-muted">server panel</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active ? "bg-surface3 text-ink" : "text-ink2 hover:bg-surface2 hover:text-ink"
                }`}
              >
                <Icon size={15} className={active ? "text-accent" : ""} />
                {item.label}
                {item.href === "/access" && (server?.pendingApprovals ?? 0) > 0 && (
                  <span className="ml-auto rounded-full bg-warn/20 px-1.5 text-[10px] font-semibold text-warn">
                    {server!.pendingApprovals}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 text-[11px] text-muted">
          Signed in as <span className="text-ink2">{me?.username ?? "…"}</span>
        </div>
      </aside>

      {/* main */}
      <div className="ml-52 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/90 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                isRunning ? "border-good/40 bg-good/10 text-good" : "border-crit/40 bg-crit/10 text-crit"
              }`}
            >
              <CircleDot size={12} />
              {isRunning ? "Online" : "Offline"}
            </span>
            {isRunning && (
              <span className="text-xs text-ink2">
                {playerCount} player{playerCount === 1 ? "" : "s"} online
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell bump={unreadBump} />
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs text-ink2 hover:text-ink"
            >
              <LogOut size={13} /> Log out
            </button>
          </div>
        </header>

        {me?.mustChange && pathname !== "/settings" && (
          <div className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-xs text-warn">
            You are using the initial admin password —{" "}
            <Link href="/settings" className="underline">
              change it now
            </Link>
            .
          </div>
        )}

        <main className="flex-1 p-6">{children}</main>
      </div>
      <Toaster />
      {/* refresh server summary when the tab regains focus */}
      <FocusRefresher onFocus={refresh} />
    </div>
  );
}

function FocusRefresher({ onFocus }: { onFocus: () => void }) {
  useEffect(() => {
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [onFocus]);
  return null;
}

function NotificationBell({ bump }: { bump: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const d = await api<{ notifications: NotificationRow[]; unread: number }>("/api/notifications?limit=30");
      setItems(d.notifications);
      setUnread(d.unread);
    } catch {}
  };

  useEffect(() => {
    void load();
  }, [bump]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAll = async () => {
    await api("/api/notifications", { body: { op: "read-all" } });
    void load();
  };

  const levelColor = { info: "info", success: "good", warn: "warn", error: "crit" } as const;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative flex items-center rounded-lg border border-border bg-surface2 p-2 text-ink2 hover:text-ink"
      >
        <Bell size={14} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-96 rounded-xl border border-border bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-xs font-semibold">Notifications</span>
            <button onClick={markAll} className="text-[11px] text-ink2 hover:text-ink">
              Mark all read
            </button>
          </header>
          <div className="scroll-slim max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted">Nothing yet</div>}
            {items.map((n) => (
              <div
                key={n.id}
                className={`border-b border-border/50 px-3.5 py-2.5 ${n.read ? "opacity-55" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <Badge color={levelColor[n.level]}>{n.level}</Badge>
                  <span className="text-xs font-medium text-ink">{n.title}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted">{timeAgo(n.ts)}</span>
                </div>
                {n.body && <div className="mt-1 text-[11px] leading-relaxed text-ink2">{n.body}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
