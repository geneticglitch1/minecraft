"use client";

import { useState } from "react";
import { Package, Search, Trash2, Power, Download, RefreshCw, Lock } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Badge, Input, EmptyState, Modal } from "@/components/ui";
import { fmtBytes } from "@/lib/format";

type ModsData = {
  installed: Array<{
    file: string;
    name: string;
    id: string | null;
    version: string | null;
    disabled: boolean;
    size: number;
  }>;
  managed: string[];
  mcVersion: string;
};

type SearchHit = {
  slug: string;
  title: string;
  description: string;
  downloads: number;
  icon_url: string | null;
  server_side: string;
  client_side: string;
};

const PROTECTED = new Set(["fabric-api", "easyauth"]);

export default function ModsPage() {
  const { data, refresh } = useApi<ModsData>("/api/mods", 0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [needsApply, setNeedsApply] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setHits(await api<SearchHit[]>(`/api/mods/search?q=${encodeURIComponent(query.trim())}`));
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSearching(false);
    }
  };

  const manage = async (label: string, body: Record<string, unknown>, message: string) => {
    setBusy(label);
    try {
      const res = await api<{ needsApply?: boolean; needsRestart?: boolean }>("/api/mods/manage", { body });
      toast(message, "success");
      if (res.needsApply || res.needsRestart) setNeedsApply(true);
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setConfirmApply(false);
    setApplying(true);
    try {
      await api("/api/mods/apply", { method: "POST" });
      toast("Server recreated — mods re-resolved for the current version", "success");
      setNeedsApply(false);
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setApplying(false);
    }
  };

  const managedSet = new Set((data?.managed ?? []).map((s) => s.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Mods</h1>
          <p className="mt-0.5 text-xs text-ink2">
            Managed mods auto-update to the newest build for Minecraft {data?.mcVersion ?? "…"} on every apply
          </p>
        </div>
        <Button variant={needsApply ? "primary" : "ghost"} onClick={() => setConfirmApply(true)} busy={applying}>
          <RefreshCw size={14} /> {needsApply ? "Apply changes (restarts server)" : "Update all & restart"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Modrinth search */}
        <Card title="Add from Modrinth">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder={`Search Fabric mods for ${data?.mcVersion ?? "26.2"}…`}
              className="w-full"
            />
            <Button onClick={() => void search()} busy={searching}>
              <Search size={14} />
            </Button>
          </div>
          <div className="scroll-slim mt-3 max-h-96 space-y-2 overflow-y-auto">
            {hits === null && (
              <p className="py-6 text-center text-xs text-muted">
                Search Modrinth — results are pre-filtered to Fabric + your server version.
              </p>
            )}
            {hits?.length === 0 && <p className="py-6 text-center text-xs text-muted">No compatible mods found.</p>}
            {hits?.map((h) => {
              const already = managedSet.has(h.slug.toLowerCase());
              return (
                <div key={h.slug} className="flex items-center gap-3 rounded-lg border border-border bg-surface2 p-2.5">
                  {h.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.icon_url} alt="" className="h-9 w-9 rounded-md bg-surface3" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface3">
                      <Package size={16} className="text-muted" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{h.title}</span>
                      {h.client_side === "required" && (
                        <Badge color="warn">needs client install</Badge>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted">{h.description}</div>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? "ghost" : "primary"}
                    disabled={already}
                    busy={busy === `add-${h.slug}`}
                    onClick={() => void manage(`add-${h.slug}`, { op: "add", slug: h.slug }, `${h.title} added`)}
                  >
                    <Download size={12} /> {already ? "Added" : "Add"}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* managed list */}
        <Card title={`Managed mods (${data?.managed.length ?? 0})`}>
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            These Modrinth projects are pinned in <code>.env</code> (MODRINTH_PROJECTS). The server resolves the
            newest compatible build on every start, so updating Minecraft also updates these automatically.
          </p>
          <ul className="space-y-1.5">
            {(data?.managed ?? []).map((slug) => (
              <li key={slug} className="flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2">
                <span className="font-mono text-sm">{slug}</span>
                {PROTECTED.has(slug.toLowerCase()) && (
                  <Badge color="info">
                    <Lock size={9} /> required
                  </Badge>
                )}
                <span className="ml-auto">
                  {!PROTECTED.has(slug.toLowerCase()) && (
                    <Button
                      size="sm"
                      variant="danger"
                      busy={busy === `remove-${slug}`}
                      onClick={() => void manage(`remove-${slug}`, { op: "remove", slug }, `${slug} removed`)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* installed jars */}
      <Card title="Installed jar files" pad={false}>
        {!data || data.installed.length === 0 ? (
          <EmptyState
            icon={<Package size={28} />}
            title="No mod jars found"
            hint="Jars appear here once the server has started and downloaded its mods. You can also upload jars via the Files page (mods/ folder)."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Mod</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.installed.map((m) => (
                <tr key={m.file} className={`border-b border-border/50 last:border-0 ${m.disabled ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">
                    {m.name} {m.disabled && <Badge color="muted">disabled</Badge>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink2">{m.version ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{m.file}</td>
                  <td className="px-4 py-2.5 text-ink2">{fmtBytes(m.size)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        busy={busy === `toggle-${m.file}`}
                        onClick={() =>
                          void manage(
                            `toggle-${m.file}`,
                            { op: "toggle", file: m.file },
                            m.disabled ? `${m.name} enabled` : `${m.name} disabled`
                          )
                        }
                        title={m.disabled ? "Enable" : "Disable (renames to .disabled)"}
                      >
                        <Power size={12} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        busy={busy === `delete-${m.file}`}
                        onClick={() => void manage(`delete-${m.file}`, { op: "delete", file: m.file }, `${m.file} deleted`)}
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

      <Modal open={confirmApply} onClose={() => setConfirmApply(false)} title="Apply mod changes?">
        <p className="text-sm leading-relaxed text-ink2">
          This recreates the server container: online players are disconnected for a minute or two while the
          server restarts and re-resolves every managed mod against Minecraft {data?.mcVersion}.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmApply(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void apply()}>
            Apply &amp; restart
          </Button>
        </div>
      </Modal>
    </div>
  );
}
