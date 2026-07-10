"use client";

import { useEffect, useState } from "react";
import { Rocket, AlertTriangle } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Input, Modal, Toggle } from "@/components/ui";

type ConfigValues = Record<string, string>;

const FIELDS: Array<{
  key: string;
  label: string;
  hint?: string;
  section: "server" | "gameplay" | "resources" | "backups";
  placeholder?: string;
}> = [
  { key: "MC_VERSION", label: "Minecraft version", hint: "e.g. 26.2 — change, then Apply to upgrade", section: "server" },
  { key: "SERVER_TYPE", label: "Server type / loader", hint: "FABRIC (default), NEOFORGE, FORGE, VANILLA…", section: "server" },
  { key: "MC_MOTD", label: "MOTD (server list text)", section: "server" },
  { key: "MC_PORT", label: "Game port", section: "server" },
  { key: "MODRINTH_MODPACK", label: "Modrinth modpack slug", hint: "leave empty for plain Fabric — see docs before using", section: "server" },
  { key: "MC_DIFFICULTY", label: "Difficulty", hint: "peaceful / easy / normal / hard", section: "gameplay" },
  { key: "MC_MAX_PLAYERS", label: "Max players", section: "gameplay" },
  { key: "MC_VIEW_DISTANCE", label: "View distance", hint: "chunks — lower = less RAM/CPU", section: "gameplay" },
  { key: "MC_SIMULATION_DISTANCE", label: "Simulation distance", section: "gameplay" },
  { key: "MC_SEED", label: "World seed", hint: "only applies to newly generated worlds", section: "gameplay" },
  { key: "MC_MEMORY", label: "Java heap", hint: "e.g. 6G — leave ~1 GB headroom below the container limit", section: "resources" },
  { key: "MC_CONTAINER_MEM_LIMIT", label: "Container memory limit", hint: "e.g. 7g", section: "resources" },
  { key: "TZ", label: "Timezone", hint: "e.g. Asia/Kolkata — used by schedules and backups", section: "resources" },
  { key: "BACKUP_INTERVAL", label: "Backup interval", hint: "e.g. 6h, 24h", section: "backups" },
  { key: "BACKUP_RETENTION_DAYS", label: "Keep backups (days)", section: "backups" },
];

const SECTIONS = [
  { id: "server", title: "Server" },
  { id: "gameplay", title: "Gameplay" },
  { id: "resources", title: "Resources & time" },
  { id: "backups", title: "Backups" },
] as const;

export default function ConfigPage() {
  const { data, refresh } = useApi<ConfigValues>("/api/config", 0);
  const [values, setValues] = useState<ConfigValues>({});
  const [saving, setSaving] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updates: ConfigValues = {};
      for (const f of FIELDS) updates[f.key] = values[f.key] ?? "";
      await api("/api/config", { body: { updates } });
      toast("Saved to .env — apply to make it live", "success");
      setDirty(false);
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      await api("/api/config/apply", { body: { service: "mc", backupFirst } });
      await api("/api/config/apply", { body: { service: "backup" } });
      toast("Applied — containers recreated with the new configuration", "success");
      setApplyOpen(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setApplying(false);
    }
  };

  const versionChanged = data && values["MC_VERSION"] !== data["MC_VERSION"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Configuration</h1>
          <p className="mt-0.5 text-xs text-ink2">
            Values live in <code>.env</code>. Save writes the file; Apply recreates the server so they take
            effect. Raw files (server.properties, EasyAuth) are editable in{" "}
            <a href="/files" className="text-accent underline">
              Files
            </a>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} busy={saving} disabled={!dirty}>
            Save
          </Button>
          <Button variant="primary" onClick={() => setApplyOpen(true)} disabled={dirty}>
            <Rocket size={14} /> Apply (restarts server)
          </Button>
        </div>
      </div>

      {versionChanged && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <AlertTriangle size={15} />
          Version change detected ({data?.["MC_VERSION"]} → {values["MC_VERSION"]}). Save, then Apply with the
          safety backup enabled. Mods are automatically re-resolved for the new version.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.id} title={section.title}>
            <div className="space-y-3">
              {FIELDS.filter((f) => f.section === section.id).map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-ink2">{f.label}</label>
                  <Input
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full font-mono"
                    placeholder={f.placeholder}
                  />
                  {f.hint && <p className="mt-1 text-[10px] text-muted">{f.hint}</p>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Apply configuration?">
        <div className="space-y-3 text-sm text-ink2">
          <p>
            The server (and backup sidecar) containers are recreated with the saved <code>.env</code>. Players
            online are disconnected while the server restarts.
          </p>
          <Toggle checked={backupFirst} onChange={setBackupFirst} label="Take a safety backup first (recommended)" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setApplyOpen(false)}>Cancel</Button>
          <Button variant="primary" busy={applying} onClick={apply}>
            Apply now
          </Button>
        </div>
      </Modal>
    </div>
  );
}
