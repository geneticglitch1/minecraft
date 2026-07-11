"use client";

import { useState } from "react";
import { ShieldAlert, Ban, Undo2, WifiOff, DoorClosed } from "lucide-react";
import { api, useApi, useSSE, toast } from "@/lib/api";
import { Card, Button, Badge, Input, Modal, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";

type BlockedRow = { player: string; ip: string | null; attempts: number; last_ts: number; first_ts: number };
type BanEntry = { name?: string; ip?: string; created?: string; reason?: string; source?: string };
type SecurityData = { blocked: BlockedRow[]; bans: { players: BanEntry[]; ips: BanEntry[] } };

export default function SecurityPage() {
  const { data, refresh } = useApi<SecurityData>("/api/security", 15000);
  const [busy, setBusy] = useState<string | null>(null);
  const [banIpTarget, setBanIpTarget] = useState<string | null>(null);
  const [manualBan, setManualBan] = useState({ name: "", ip: "", reason: "" });
  const [lockdownOpen, setLockdownOpen] = useState(false);

  useSSE("/api/stream/events", {
    "mc-event": (e) => {
      if ((e as { type: string }).type === "blocked") void refresh();
    },
  });

  const run = async (label: string, body: Record<string, unknown>, message: string) => {
    setBusy(label);
    try {
      await api("/api/security", { body });
      toast(message, "success");
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const blocked = data?.blocked ?? [];
  const bannedIps = new Set((data?.bans.ips ?? []).map((b) => b.ip));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Security</h1>
          <p className="mt-0.5 text-xs text-ink2">
            Blocked join attempts, bans, and emergency controls. The whitelist already rejects everyone you
            haven't approved — bans add a second wall and cut connection noise.
          </p>
        </div>
        <Button variant="danger" onClick={() => setLockdownOpen(true)}>
          <DoorClosed size={14} /> Kick everyone
        </Button>
      </div>

      {/* blocked attempts */}
      <Card title={`Blocked join attempts — last 7 days (${blocked.length})`} pad={false}>
        {blocked.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert size={28} />}
            title="No blocked attempts recorded"
            hint="When someone who isn't approved tries to join (usually internet scanner bots), they show up here with their IP."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Username tried</th>
                <th className="px-4 py-2 font-medium">From IP</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((b) => (
                <tr key={`${b.player}-${b.ip}`} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-mono font-medium">{b.player}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink2">{b.ip ?? "unknown"}</td>
                  <td className="px-4 py-2.5 text-ink2">{b.attempts}</td>
                  <td className="px-4 py-2.5 text-ink2">{timeAgo(b.last_ts)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {b.ip &&
                      (bannedIps.has(b.ip) ? (
                        <Badge color="crit">IP banned</Badge>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => setBanIpTarget(b.ip)}>
                          <WifiOff size={12} /> Ban IP
                        </Button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* banned players */}
        <Card title={`Banned players (${data?.bans.players.length ?? 0})`}>
          {(data?.bans.players ?? []).length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">Nobody is banned.</p>
          ) : (
            <ul className="space-y-1.5">
              {data!.bans.players.map((b) => (
                <li key={b.name} className="flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm">
                  <Ban size={13} className="text-crit" />
                  <span className="font-mono font-medium">{b.name}</span>
                  {b.reason && <span className="truncate text-[11px] text-muted">{b.reason}</span>}
                  <span className="ml-auto">
                    <Button
                      size="sm"
                      busy={busy === `pardon-${b.name}`}
                      onClick={() =>
                        void run(`pardon-${b.name}`, { op: "pardon-player", name: b.name }, `${b.name} unbanned`)
                      }
                    >
                      <Undo2 size={12} /> Unban
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <Input
              placeholder="Username to ban"
              value={manualBan.name}
              onChange={(e) => setManualBan({ ...manualBan, name: e.target.value })}
              className="flex-1 font-mono"
              maxLength={16}
            />
            <Button
              variant="danger"
              size="sm"
              disabled={!manualBan.name.trim()}
              busy={busy === "manual-ban"}
              onClick={() =>
                void run(
                  "manual-ban",
                  { op: "ban-player", name: manualBan.name.trim(), reason: manualBan.reason || undefined },
                  `${manualBan.name.trim()} banned`
                )
              }
            >
              <Ban size={12} /> Ban
            </Button>
          </div>
        </Card>

        {/* banned IPs */}
        <Card title={`Banned IPs (${data?.bans.ips.length ?? 0})`}>
          {(data?.bans.ips ?? []).length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">No IP bans.</p>
          ) : (
            <ul className="space-y-1.5">
              {data!.bans.ips.map((b) => (
                <li key={b.ip} className="flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm">
                  <WifiOff size={13} className="text-crit" />
                  <span className="font-mono font-medium">{b.ip}</span>
                  {b.reason && <span className="truncate text-[11px] text-muted">{b.reason}</span>}
                  <span className="ml-auto">
                    <Button
                      size="sm"
                      busy={busy === `pardon-ip-${b.ip}`}
                      onClick={() =>
                        void run(`pardon-ip-${b.ip}`, { op: "pardon-ip", ip: b.ip }, `${b.ip} unbanned`)
                      }
                    >
                      <Undo2 size={12} /> Unban
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <Input
              placeholder="IP address to ban"
              value={manualBan.ip}
              onChange={(e) => setManualBan({ ...manualBan, ip: e.target.value })}
              className="flex-1 font-mono"
            />
            <Button
              variant="danger"
              size="sm"
              disabled={!manualBan.ip.trim()}
              busy={busy === "manual-ban-ip"}
              onClick={() =>
                void run("manual-ban-ip", { op: "ban-ip", ip: manualBan.ip.trim() }, `${manualBan.ip.trim()} banned`)
              }
            >
              <WifiOff size={12} /> Ban IP
            </Button>
          </div>
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        Tip: scanner bots find servers by sweeping the default port. Changing <code>MC_PORT</code> in
        Configuration (e.g. to 25599) makes most of this noise disappear — friends then connect with{" "}
        <code>ip:port</code>.
      </p>

      {/* ban IP confirm */}
      <Modal open={banIpTarget !== null} onClose={() => setBanIpTarget(null)} title={`Ban IP ${banIpTarget}?`}>
        <p className="text-sm text-ink2">
          Every connection from this address will be rejected before login. Careful: if this is a friend behind
          the same network as others, they all get blocked.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setBanIpTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            busy={busy === "ban-ip-modal"}
            onClick={() => {
              const ip = banIpTarget!;
              setBanIpTarget(null);
              void run("ban-ip-modal", { op: "ban-ip", ip, reason: "Blocked join attempts" }, `${ip} banned`);
            }}
          >
            Ban this IP
          </Button>
        </div>
      </Modal>

      {/* lockdown confirm */}
      <Modal open={lockdownOpen} onClose={() => setLockdownOpen(false)} title="Kick everyone?">
        <p className="text-sm text-ink2">
          Disconnects every online player immediately. The whitelist keeps un-approved people out as always;
          approved players can rejoin right away unless you also revoke them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setLockdownOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            busy={busy === "kick-all"}
            onClick={() => {
              setLockdownOpen(false);
              void run("kick-all", { op: "kick-all" }, "Everyone kicked");
            }}
          >
            Kick all players
          </Button>
        </div>
      </Modal>
    </div>
  );
}
