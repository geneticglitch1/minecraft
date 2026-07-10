"use client";

import { useState } from "react";
import { Archive, Download, Trash2, History, PlayCircle } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Input, EmptyState, Modal } from "@/components/ui";
import { fmtBytes, fmtDateTime, timeAgo } from "@/lib/format";

type BackupsData = {
  backups: Array<{ name: string; size: number; mtime: number }>;
  totalSize: number;
  interval: string;
  retentionDays: string;
};

export default function BackupsPage() {
  const { data, refresh } = useApi<BackupsData>("/api/backups", 30000);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);

  const backupNow = async () => {
    setCreating(true);
    toast("Backup started — this can take a minute on a big world", "info");
    try {
      const res = await api<{ created: string }>("/api/backups", { method: "POST" });
      toast(`Backup created: ${res.created}`, "success");
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (name: string) => {
    setDeleting(name);
    try {
      await api(`/api/backups/file?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      toast(`${name} deleted`, "warn");
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDeleting(null);
    }
  };

  const restore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await api("/api/backups/restore", { body: { name: restoreTarget, confirm: restoreConfirm } });
      toast("Restore complete — the server is starting with the restored world", "success");
      setRestoreTarget(null);
      setRestoreConfirm("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Backups</h1>
          <p className="mt-0.5 text-xs text-ink2">
            Automatic every {data?.interval ?? "24h"}, kept {data?.retentionDays ?? "7"} days ·{" "}
            {fmtBytes(data?.totalSize)} total — change in{" "}
            <a href="/config" className="text-accent underline">
              Configuration
            </a>
          </p>
        </div>
        <Button variant="primary" onClick={backupNow} busy={creating}>
          <Archive size={14} /> Back up now
        </Button>
      </div>

      <Card pad={false}>
        {!data || data.backups.length === 0 ? (
          <EmptyState
            icon={<Archive size={28} />}
            title="No backups yet"
            hint='The backup sidecar creates the first one automatically shortly after the server starts, or press "Back up now".'
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Backup</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b) => (
                <tr key={b.name} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">{b.name}</td>
                  <td className="px-4 py-2.5 text-ink2" title={fmtDateTime(b.mtime)}>
                    {timeAgo(b.mtime)}
                  </td>
                  <td className="px-4 py-2.5 text-ink2">{fmtBytes(b.size)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <a href={`/api/backups/file?name=${encodeURIComponent(b.name)}`}>
                        <Button size="sm" title="Download">
                          <Download size={12} />
                        </Button>
                      </a>
                      <Button size="sm" variant="warn" onClick={() => setRestoreTarget(b.name)} title="Restore">
                        <History size={12} /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        busy={deleting === b.name}
                        onClick={() => void remove(b.name)}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={restoreTarget !== null}
        onClose={() => {
          setRestoreTarget(null);
          setRestoreConfirm("");
        }}
        title="Restore backup"
      >
        <div className="space-y-3 text-sm text-ink2">
          <p>
            Restoring <code className="text-ink">{restoreTarget}</code> will:
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            <li>Stop the server (players are disconnected)</li>
            <li>
              Overwrite the current world and settings with the backup —{" "}
              <span className="text-warn">everything since the backup is lost</span>
            </li>
            <li>Start the server again</li>
          </ol>
          <p className="text-xs">
            Type <code className="text-warn">restore</code> to confirm:
          </p>
          <Input
            value={restoreConfirm}
            onChange={(e) => setRestoreConfirm(e.target.value)}
            placeholder="restore"
            className="w-full font-mono"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setRestoreTarget(null)}>Cancel</Button>
          <Button variant="danger" disabled={restoreConfirm !== "restore"} busy={restoring} onClick={restore}>
            <PlayCircle size={13} /> Restore this backup
          </Button>
        </div>
      </Modal>
    </div>
  );
}
