"use client";

import { useEffect, useState } from "react";
import { KeyRound, Webhook, Globe, AlertTriangle } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Input, Toggle, Modal } from "@/components/ui";
import { fmtBytes } from "@/lib/format";

type Settings = {
  registrationWindowMinutes: number;
  notifyJoins: boolean;
  discordEnabled: boolean;
  discordJoins: boolean;
  discordWebhookUrl: string;
};

type WorldInfo = { seed: string | null; sizeBytes: number | null; dimensions: string[]; levelName: string | null };

export default function SettingsPage() {
  const { data, refresh } = useApi<Settings>("/api/settings", 0);
  const { data: me, refresh: refreshMe } = useApi<{ username: string; mustChange: boolean }>("/api/auth/me");
  const { data: world } = useApi<WorldInfo>("/api/world", 0);

  const [values, setValues] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [changing, setChanging] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  const save = async () => {
    if (!values) return;
    setSaving(true);
    try {
      await api("/api/settings", { body: values });
      toast("Settings saved", "success");
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPw !== newPw2) {
      toast("New passwords don't match", "error");
      return;
    }
    setChanging(true);
    try {
      await api("/api/auth/password", { body: { current: currentPw, next: newPw } });
      toast("Panel password changed", "success");
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
      void refreshMe();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setChanging(false);
    }
  };

  const resetWorld = async () => {
    setResetting(true);
    try {
      const res = await api<{ archived: string }>("/api/world", {
        body: { op: "reset", confirm: resetConfirm },
      });
      toast(`World reset — old world saved as ${res.archived}`, "warn");
      setResetOpen(false);
      setResetConfirm("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-0.5 text-xs text-ink2">Panel account, authentication window, notifications, danger zone</p>
      </div>

      {me?.mustChange && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <AlertTriangle size={15} /> You're still on the initial admin password — change it below.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* password */}
        <Card title="Panel password">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink2">Current password</label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink2">New password</label>
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink2">Repeat new password</label>
                <Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className="w-full" />
              </div>
            </div>
            <Button
              variant="primary"
              onClick={changePassword}
              busy={changing}
              disabled={!currentPw || newPw.length < 8 || newPw !== newPw2}
            >
              <KeyRound size={14} /> Change password
            </Button>
            <p className="text-[10px] text-muted">At least 8 characters.</p>
          </div>
        </Card>

        {/* auth window */}
        <Card title="Player registration window">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink2">Window length (minutes)</label>
              <Input
                type="number"
                min={0.5}
                max={120}
                step={0.5}
                value={values?.registrationWindowMinutes ?? ""}
                onChange={(e) =>
                  setValues((v) => (v ? { ...v, registrationWindowMinutes: Number(e.target.value) } : v))
                }
                className="w-32 font-mono"
              />
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                After you approve a username, the player has this long to join and <code>/register</code>. When
                it lapses the name is automatically removed from the whitelist again.
              </p>
            </div>
            <Toggle
              checked={values?.notifyJoins ?? true}
              onChange={(v) => setValues((s) => (s ? { ...s, notifyJoins: v } : s))}
              label="Notify on player joins/leaves"
            />
          </div>
        </Card>

        {/* discord */}
        <Card title="Discord alerts">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink2">Webhook URL</label>
              <Input
                value={values?.discordWebhookUrl ?? ""}
                onChange={(e) => setValues((v) => (v ? { ...v, discordWebhookUrl: e.target.value } : v))}
                placeholder="https://discord.com/api/webhooks/…"
                className="w-full font-mono text-xs"
              />
              <p className="mt-1 text-[10px] text-muted">
                Discord → Server settings → Integrations → Webhooks → New webhook → Copy URL
              </p>
            </div>
            <Toggle
              checked={values?.discordEnabled ?? true}
              onChange={(v) => setValues((s) => (s ? { ...s, discordEnabled: v } : s))}
              label="Send alerts to Discord"
            />
            <Toggle
              checked={values?.discordJoins ?? true}
              onChange={(v) => setValues((s) => (s ? { ...s, discordJoins: v } : s))}
              label="Include joins/leaves"
            />
            <Button
              size="sm"
              onClick={async () => {
                await save();
                try {
                  await api("/api/settings/test-discord", { method: "POST" });
                  toast("Test sent — check your Discord channel", "success");
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              }}
            >
              <Webhook size={13} /> Save &amp; send test
            </Button>
          </div>
        </Card>

        {/* danger zone */}
        <Card title="Danger zone">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Globe size={15} className="text-muted" />
              <div className="flex-1">
                <div className="font-medium">Reset world</div>
                <div className="text-xs text-muted">
                  Current world: {world?.levelName ?? "world"} ({fmtBytes(world?.sizeBytes)}) — archived, then a
                  fresh world generates. A safety backup is taken first.
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>
                Reset…
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={save} busy={saving}>
          Save settings
        </Button>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset the world?">
        <div className="space-y-3 text-sm text-ink2">
          <p>
            The server stops, the current world folder is archived inside the data directory, and a brand-new
            world generates on next start. A backup is taken first, but treat this as destructive.
          </p>
          <p className="text-xs">
            Type <code className="text-crit">reset the world</code> to confirm:
          </p>
          <Input
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder="reset the world"
            className="w-full font-mono"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={resetConfirm !== "reset the world"} busy={resetting} onClick={resetWorld}>
            Reset world
          </Button>
        </div>
      </Modal>
    </div>
  );
}
