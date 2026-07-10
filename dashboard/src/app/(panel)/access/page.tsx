"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, KeyRound, RefreshCw, Import, Copy } from "lucide-react";
import { api, useApi, useSSE, toast } from "@/lib/api";
import { Card, Button, Badge, Input, Modal, EmptyState } from "@/components/ui";
import { timeAgo, fmtCountdown, fmtDateTime } from "@/lib/format";

type ApprovedPlayer = {
  id: number;
  username: string;
  status: "pending" | "registered" | "expired" | "revoked";
  approved_at: number | null;
  window_expires_at: number | null;
  registered_at: number | null;
  last_seen_at: number | null;
  note: string | null;
};

type AccessData = {
  approved: ApprovedPlayer[];
  whitelist: string[] | null;
  registered: string[] | null;
};

const STATUS_BADGE: Record<ApprovedPlayer["status"], { color: "good" | "warn" | "crit" | "muted"; label: string }> = {
  pending: { color: "warn", label: "waiting to register" },
  registered: { color: "good", label: "registered" },
  expired: { color: "muted", label: "window expired" },
  revoked: { color: "crit", label: "revoked" },
};

export default function AccessPage() {
  const { data, error, refresh } = useApi<AccessData>("/api/approved", 10000);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ user: string; password: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [, tick] = useState(0);

  // live countdown for pending windows
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useSSE("/api/stream/events", {
    "mc-event": () => void refresh(),
  });

  const run = async (label: string, body: Record<string, unknown>, done?: (d: unknown) => void) => {
    setBusy(label);
    try {
      const d = await api("/api/approved", { body });
      done?.(d);
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const approve = () => {
    const name = newName.trim();
    if (!name) return;
    void run("approve", { op: "approve", username: name }, () => {
      toast(`${name} approved — the registration window is open`, "success");
      setNewName("");
    });
  };

  const players = data?.approved ?? [];
  const outsideWhitelist = (data?.whitelist ?? []).filter(
    (w) => !players.some((p) => p.username.toLowerCase() === w.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Access &amp; Auth</h1>
        <p className="mt-0.5 text-xs text-ink2">
          Only approved usernames can join. New players must <code>/register</code> within the window, then{" "}
          <code>/login</code> on every visit.
        </p>
      </div>

      {/* approve box */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-ink2">Minecraft username to approve</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && approve()}
              placeholder="e.g. Steve_123"
              className="w-full font-mono"
              maxLength={16}
            />
          </div>
          <Button variant="primary" onClick={approve} busy={busy === "approve"}>
            <UserPlus size={14} /> Approve &amp; open window
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Approving whitelists the name and starts the registration countdown. Tell your friend to join{" "}
          <em>right away</em> and run <code>/register &lt;password&gt; &lt;password&gt;</code>. If the timer
          expires first, the name is automatically removed from the whitelist.
        </p>
      </Card>

      {error && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{error}</div>
      )}

      {/* player table */}
      <Card
        title={`Approved players (${players.length})`}
        actions={
          <Button
            size="sm"
            onClick={() =>
              void run("import", { op: "import-whitelist" }, (d) => {
                const n = (d as { imported: number }).imported;
                toast(n > 0 ? `Imported ${n} whitelist entr${n === 1 ? "y" : "ies"}` : "Nothing new to import", "info");
              })
            }
            busy={busy === "import"}
            title="Pull in players whitelisted outside the panel"
          >
            <Import size={13} /> Import whitelist
          </Button>
        }
        pad={false}
      >
        {players.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title="Nobody approved yet"
            hint="Approve your friends' usernames above. Nobody else can join the server."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 font-medium">Registered</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const badge = STATUS_BADGE[p.status];
                return (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono font-medium">{p.username}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={badge.color}>{badge.label}</Badge>
                      {p.status === "pending" && p.window_expires_at && (
                        <span className="ml-2 font-mono text-xs text-warn">
                          {fmtCountdown(p.window_expires_at)}
                        </span>
                      )}
                      {p.note && <span className="ml-2 text-[11px] text-muted">({p.note})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink2">{timeAgo(p.last_seen_at)}</td>
                    <td className="px-4 py-2.5 text-ink2">{fmtDateTime(p.registered_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {(p.status === "expired" || p.status === "revoked") && (
                          <Button
                            size="sm"
                            onClick={() =>
                              void run(`reopen-${p.username}`, { op: "reopen", username: p.username }, () =>
                                toast(`Window re-opened for ${p.username}`, "success")
                              )
                            }
                            busy={busy === `reopen-${p.username}`}
                          >
                            <RefreshCw size={12} /> Re-open window
                          </Button>
                        )}
                        {p.status === "registered" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                void run(
                                  `reset-${p.username}`,
                                  { op: "reset-password", username: p.username },
                                  (d) =>
                                    setTempPassword({
                                      user: p.username,
                                      password: (d as { tempPassword: string }).tempPassword,
                                    })
                                )
                              }
                              busy={busy === `reset-${p.username}`}
                              title="Set a temporary password and share it with them"
                            >
                              <KeyRound size={12} /> Reset password
                            </Button>
                          </>
                        )}
                        {p.status !== "revoked" && (
                          <Button size="sm" variant="danger" onClick={() => setConfirmRevoke(p.username)}>
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* whitelist drift warning */}
      {outsideWhitelist.length > 0 && (
        <Card title="On the whitelist but not managed here">
          <div className="flex flex-wrap items-center gap-2">
            {outsideWhitelist.map((w) => (
              <Badge key={w} color="warn">
                {w}
              </Badge>
            ))}
            <span className="text-xs text-muted">— use “Import whitelist” to manage them from the panel.</span>
          </div>
        </Card>
      )}

      {/* temp password modal */}
      <Modal
        open={tempPassword !== null}
        onClose={() => setTempPassword(null)}
        title={`Temporary password for ${tempPassword?.user}`}
      >
        <p className="text-sm text-ink2">
          Share this privately. They log in with it and can change it in game via{" "}
          <code>/account</code>.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2">
          <code className="flex-1 font-mono text-lg tracking-wide text-accent">{tempPassword?.password}</code>
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(tempPassword?.password ?? "");
              toast("Copied to clipboard", "success");
            }}
          >
            <Copy size={12} /> Copy
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          This password is shown once and never stored by the panel.
        </p>
      </Modal>

      {/* revoke confirm modal */}
      <Modal open={confirmRevoke !== null} onClose={() => setConfirmRevoke(null)} title={`Revoke ${confirmRevoke}?`}>
        <p className="text-sm text-ink2">
          This removes them from the whitelist, deletes their password account, and kicks them if online. You
          can re-approve them later.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmRevoke(null)}>Cancel</Button>
          <Button
            variant="danger"
            busy={busy === `revoke-${confirmRevoke}`}
            onClick={() => {
              const name = confirmRevoke!;
              setConfirmRevoke(null);
              void run(`revoke-${name}`, { op: "revoke", username: name }, () =>
                toast(`${name} revoked`, "warn")
              );
            }}
          >
            Revoke access
          </Button>
        </div>
      </Modal>
    </div>
  );
}
