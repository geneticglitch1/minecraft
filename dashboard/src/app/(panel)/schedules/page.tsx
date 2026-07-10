"use client";

import { useState } from "react";
import { CalendarClock, Plus, Play, Trash2, Pencil } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Badge, Input, Select, Modal, EmptyState, Toggle } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

type Schedule = {
  id: number;
  name: string;
  cron: string;
  action: "restart" | "backup" | "command" | "announce";
  payload: string | null;
  enabled: number;
  last_run_at: number | null;
  last_result: string | null;
};

const ACTION_OPTIONS = [
  { value: "restart", label: "Restart server (30 s warning)" },
  { value: "backup", label: "Create backup" },
  { value: "announce", label: "In-game announcement" },
  { value: "command", label: "Console command" },
];

const PRESETS = [
  { label: "Every day at 5:00", cron: "0 5 * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Every Sunday at 4:00", cron: "0 4 * * 0" },
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
];

type Draft = { id?: number; name: string; cron: string; action: Schedule["action"]; payload: string };

const EMPTY_DRAFT: Draft = { name: "", cron: "0 5 * * *", action: "restart", payload: "" };

export default function SchedulesPage() {
  const { data: schedules, refresh } = useApi<Schedule[]>("/api/schedules", 15000);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, body: Record<string, unknown>, message?: string) => {
    setBusy(label);
    try {
      await api("/api/schedules", { body });
      if (message) toast(message, "success");
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const body =
      draft.id === undefined
        ? { op: "create", name: draft.name, cron: draft.cron, action: draft.action, payload: draft.payload || undefined }
        : { op: "update", id: draft.id, name: draft.name, cron: draft.cron, action: draft.action, payload: draft.payload };
    setBusy("save");
    try {
      await api("/api/schedules", { body });
      toast(draft.id === undefined ? "Schedule created" : "Schedule updated", "success");
      setDraft(null);
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const needsPayload = draft?.action === "command" || draft?.action === "announce";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Schedules</h1>
          <p className="mt-0.5 text-xs text-ink2">Automatic restarts, backups, announcements and commands (cron)</p>
        </div>
        <Button variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus size={14} /> New schedule
        </Button>
      </div>

      <Card pad={false}>
        {!schedules || schedules.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="No schedules yet"
            hint="A nightly restart (e.g. daily at 5:00) keeps modded servers fresh, and extra backups never hurt."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">When (cron)</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium">Enabled</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink2">{s.cron}</td>
                  <td className="px-4 py-2.5">
                    <Badge color="info">{s.action}</Badge>
                    {s.payload && (
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {s.payload.length > 40 ? s.payload.slice(0, 40) + "…" : s.payload}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink2">
                    {fmtDateTime(s.last_run_at)}
                    {s.last_result?.startsWith("ERROR") && (
                      <span className="ml-1 text-crit" title={s.last_result}>
                        failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Toggle
                      checked={s.enabled === 1}
                      onChange={() => void run(`toggle-${s.id}`, { op: "toggle", id: s.id })}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        busy={busy === `run-${s.id}`}
                        onClick={() => void run(`run-${s.id}`, { op: "run", id: s.id }, `"${s.name}" executed`)}
                        title="Run now"
                      >
                        <Play size={12} />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setDraft({ id: s.id, name: s.name, cron: s.cron, action: s.action, payload: s.payload ?? "" })
                        }
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        busy={busy === `delete-${s.id}`}
                        onClick={() => void run(`delete-${s.id}`, { op: "delete", id: s.id }, `"${s.name}" deleted`)}
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

      <Modal open={draft !== null} onClose={() => setDraft(null)} title={draft?.id === undefined ? "New schedule" : "Edit schedule"}>
        {draft && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink2">Name</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Nightly restart"
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink2">Action</label>
              <Select
                value={draft.action}
                onChange={(v) => setDraft({ ...draft, action: v as Schedule["action"] })}
                options={ACTION_OPTIONS}
                className="w-full"
              />
            </div>
            {needsPayload && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink2">
                  {draft.action === "announce" ? "Message" : "Command (without /)"}
                </label>
                <Input
                  value={draft.payload}
                  onChange={(e) => setDraft({ ...draft, payload: e.target.value })}
                  placeholder={draft.action === "announce" ? "Backup starting soon!" : "save-all"}
                  className="w-full font-mono"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink2">Cron expression</label>
              <Input
                value={draft.cron}
                onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
                className="w-full font-mono"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.cron}
                    onClick={() => setDraft({ ...draft, cron: p.cron })}
                    className="rounded-md border border-border bg-surface2 px-2 py-0.5 text-[10px] text-ink2 hover:text-ink"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted">minute hour day-of-month month day-of-week (server timezone)</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setDraft(null)}>Cancel</Button>
              <Button
                variant="primary"
                busy={busy === "save"}
                disabled={!draft.name.trim() || (needsPayload && !draft.payload.trim())}
                onClick={saveDraft}
              >
                Save schedule
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
