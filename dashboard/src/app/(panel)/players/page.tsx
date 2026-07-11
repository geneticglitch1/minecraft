"use client";

import { useState } from "react";
import { Users, UserX, Wifi, Crown, Gavel, HeartPulse, MapPin, Gift } from "lucide-react";
import { api, useApi, useSSE, toast } from "@/lib/api";
import { Card, Badge, Button, EmptyState, Modal, Input, Select } from "@/components/ui";
import { timeAgo, fmtDateTime } from "@/lib/format";

type PlayerRow = {
  name: string;
  uuid: string;
  playTimeHours: number;
  deaths: number;
  mobKills: number;
  playerKills: number;
  distanceKm: number;
  jumps: number;
  damageDealt: number;
  blocksMined: number;
  isOnline: boolean;
  ping: number | null;
  authStatus: string | null;
  lastSeenAt: number | null;
};

type PlayersData = { online: string[]; max: number; players: PlayerRow[] };
type ActivityRow = { id: number; ts: number; type: string; player: string | null; detail: string | null };

export default function PlayersPage() {
  const { data, refresh } = useApi<PlayersData>("/api/players", 15000);
  const { data: joins, refresh: refreshJoins } = useApi<ActivityRow[]>("/api/activity?limit=30", 20000);
  const [detail, setDetail] = useState<PlayerRow | null>(null);
  const [kicking, setKicking] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState<string | null>(null);
  const [tpTarget, setTpTarget] = useState("");
  const [giveItemId, setGiveItemId] = useState("");
  const [giveCount, setGiveCount] = useState("1");

  const adminAction = async (label: string, body: Record<string, unknown>, message: string) => {
    setAdminBusy(label);
    try {
      await api("/api/admin", { body });
      toast(message, "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setAdminBusy(null);
    }
  };

  const banPlayer = async (name: string) => {
    setAdminBusy("ban");
    try {
      await api("/api/security", { body: { op: "ban-player", name, reason: "Banned by the admin" } });
      toast(`${name} banned`, "warn");
      setDetail(null);
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setAdminBusy(null);
    }
  };

  useSSE("/api/stream/events", {
    "mc-event": () => {
      void refresh();
      void refreshJoins();
    },
  });

  const kick = async (name: string) => {
    setKicking(name);
    try {
      await api("/api/console", { body: { command: `kick ${name} Kicked from the panel` } });
      toast(`${name} kicked`, "warn");
      setTimeout(() => void refresh(), 1000);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setKicking(null);
    }
  };

  const players = data?.players ?? [];
  const online = players.filter((p) => p.isOnline);
  const onlineNames = data?.online ?? [];
  const joinEvents = (joins ?? []).filter((j) => ["join", "leave", "connect"].includes(j.type));

  const pingBadge = (ping: number | null) => {
    if (ping === null) return null;
    const color = ping > 250 ? "crit" : ping > 120 ? "warn" : "good";
    return (
      <Badge color={color}>
        <Wifi size={10} /> {ping} ms
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Players</h1>
        <p className="mt-0.5 text-xs text-ink2">
          {online.length} online{data?.max ? ` of ${data.max} max` : ""} · {players.length} have played
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="All players" pad={false}>
            {players.length === 0 ? (
              <EmptyState
                icon={<Users size={28} />}
                title="No player data yet"
                hint="Stats appear after someone plays on the server."
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Player</th>
                    <th className="px-4 py-2 font-medium">Playtime</th>
                    <th className="px-4 py-2 font-medium">Deaths</th>
                    <th className="px-4 py-2 font-medium">Last seen</th>
                    <th className="px-4 py-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr
                      key={p.uuid}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-surface2"
                      onClick={() => setDetail(p)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${p.isOnline ? "bg-good" : "bg-surface3"}`}
                            title={p.isOnline ? "online" : "offline"}
                          />
                          <span className="font-mono font-medium">{p.name}</span>
                          {p.isOnline && pingBadge(p.ping)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-ink2">{p.playTimeHours} h</td>
                      <td className="px-4 py-2.5 text-ink2">{p.deaths}</td>
                      <td className="px-4 py-2.5 text-ink2">
                        {p.isOnline ? <span className="text-good">online now</span> : timeAgo(p.lastSeenAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.isOnline && (
                          <Button
                            size="sm"
                            variant="danger"
                            busy={kicking === p.name}
                            onClick={(e) => {
                              e.stopPropagation();
                              void kick(p.name);
                            }}
                          >
                            <UserX size={12} /> Kick
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* join/leave feed */}
        <Card title="Joins & leaves">
          {joinEvents.length === 0 ? (
            <EmptyState title="No connections yet" />
          ) : (
            <ul className="space-y-2">
              {joinEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <Badge color={e.type === "join" ? "good" : e.type === "leave" ? "muted" : "info"}>
                    {e.type === "connect" ? "connecting" : e.type}
                  </Badge>
                  <span className="font-mono text-xs font-medium">{e.player}</span>
                  {e.type === "connect" && e.detail && (
                    <span className="font-mono text-[10px] text-muted">{e.detail}</span>
                  )}
                  <span className="ml-auto text-[10px] text-muted">{timeAgo(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* stats drawer */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ""} wide>
        {detail && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              {detail.isOnline ? <Badge color="good">online</Badge> : <Badge color="muted">offline</Badge>}
              {detail.authStatus && <Badge color="info">{detail.authStatus}</Badge>}
              {detail.isOnline && detail.ping !== null && pingBadge(detail.ping)}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Playtime", `${detail.playTimeHours} h`],
                ["Deaths", detail.deaths],
                ["Mob kills", detail.mobKills],
                ["Player kills", detail.playerKills],
                ["Traveled", `${detail.distanceKm} km`],
                ["Blocks mined", detail.blocksMined.toLocaleString()],
                ["Jumps", detail.jumps.toLocaleString()],
                ["Damage dealt", detail.damageDealt.toLocaleString()],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-border bg-surface2 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
                  <div className="mt-0.5 text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-muted">
              <div>UUID: <code>{detail.uuid}</code></div>
              <div>Last seen: {detail.isOnline ? "online now" : fmtDateTime(detail.lastSeenAt)}</div>
            </div>

            {/* admin actions */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
              {detail.isOnline && (
                <>
                  {(["survival", "creative", "spectator"] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="sm"
                      busy={adminBusy === `gm-${mode}`}
                      onClick={() => void adminAction(`gm-${mode}`, { op: "gamemode", name: detail.name, mode }, `${detail.name} → ${mode}`)}
                    >
                      {mode}
                    </Button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                </>
              )}
              <Button
                size="sm"
                busy={adminBusy === "op"}
                onClick={() => void adminAction("op", { op: "op", name: detail.name, grant: true }, `${detail.name} is now an operator`)}
              >
                <Crown size={12} /> Op
              </Button>
              <Button
                size="sm"
                busy={adminBusy === "deop"}
                onClick={() => void adminAction("deop", { op: "op", name: detail.name, grant: false }, `${detail.name} de-opped`)}
              >
                De-op
              </Button>
              <span className="mx-1 h-4 w-px bg-border" />
              <Button size="sm" variant="danger" busy={adminBusy === "ban"} onClick={() => void banPlayer(detail.name)}>
                <Gavel size={12} /> Ban
              </Button>
            </div>

            {/* creative admin favors (online players only) */}
            {detail.isOnline && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    busy={adminBusy === "heal"}
                    onClick={() => void adminAction("heal", { op: "heal", name: detail.name }, `${detail.name} healed & fed`)}
                  >
                    <HeartPulse size={12} /> Heal
                  </Button>
                  {onlineNames.filter((n) => n !== detail.name).length > 0 && (
                    <>
                      <span className="mx-1 h-4 w-px bg-border" />
                      <Select
                        value={tpTarget}
                        onChange={setTpTarget}
                        options={[
                          { value: "", label: "teleport to…" },
                          ...onlineNames.filter((n) => n !== detail.name).map((n) => ({ value: n, label: n })),
                        ]}
                      />
                      <Button
                        size="sm"
                        disabled={!tpTarget}
                        busy={adminBusy === "tp"}
                        onClick={() =>
                          void adminAction("tp", { op: "teleport", name: detail.name, target: tpTarget }, `${detail.name} → ${tpTarget}`)
                        }
                      >
                        <MapPin size={12} /> Teleport
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    value={giveItemId}
                    onChange={(e) => setGiveItemId(e.target.value)}
                    placeholder="item id, e.g. diamond"
                    className="w-44 font-mono text-xs"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={6400}
                    value={giveCount}
                    onChange={(e) => setGiveCount(e.target.value)}
                    className="w-20 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={!giveItemId.trim()}
                    busy={adminBusy === "give"}
                    onClick={() =>
                      void adminAction(
                        "give",
                        { op: "give", name: detail.name, item: giveItemId.trim(), count: Number(giveCount) || 1 },
                        `Gave ${detail.name} ${giveCount}× ${giveItemId.trim()}`
                      )
                    }
                  >
                    <Gift size={12} /> Give
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
