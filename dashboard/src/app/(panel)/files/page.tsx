"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Folder,
  File as FileIcon,
  ChevronRight,
  Home,
  Upload,
  FolderPlus,
  Trash2,
  Download,
  Save,
  X,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { api, toast, useApi } from "@/lib/api";
import { Card, Button, EmptyState, Input, Modal } from "@/components/ui";
import { fmtBytes, fmtDateTime } from "@/lib/format";

type Entry = { name: string; type: "file" | "dir"; size: number; mtime: number };

const TEXT_EXT = /\.(txt|json|json5|yml|yaml|toml|conf|cfg|properties|log|mcmeta|nbt\.txt|md|sh|env|ini|snbt)$/i;

function langFor(name: string) {
  if (/\.json5?(\.|$)/i.test(name) || name.endsWith(".mcmeta")) return [json()];
  if (/\.ya?ml$/i.test(name)) return [yaml()];
  return [];
}

export default function FilesPage() {
  const { data: deployment } = useApi<{ managed: boolean }>("/api/deployment");
  const managed = deployment?.managed ?? true;
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ path: string; content: string; dirty: boolean; truncated: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Entry | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: string) => {
    setError(null);
    try {
      setEntries(await api<Entry[]>(`/api/files?dir=${encodeURIComponent(p)}`));
    } catch (err) {
      setEntries([]);
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(path);
  }, [path, load]);

  const open = async (entry: Entry) => {
    const full = path ? `${path}/${entry.name}` : entry.name;
    if (entry.type === "dir") {
      setPath(full);
      return;
    }
    if (!TEXT_EXT.test(entry.name) && entry.size > 512 * 1024) {
      window.location.href = `/api/files/download?path=${encodeURIComponent(full)}`;
      return;
    }
    try {
      const d = await api<{ content: string; truncated: boolean }>(`/api/files?file=${encodeURIComponent(full)}`);
      setEditing({ path: full, content: d.content, dirty: false, truncated: d.truncated });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api("/api/files", { body: { op: "write", path: editing.path, content: editing.content } });
      toast(`Saved ${editing.path}`, "success");
      setEditing({ ...editing, dirty: false });
      void load(path);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("dir", path);
    form.append("file", file);
    toast(`Uploading ${file.name}…`, "info");
    const res = await fetch("/api/files/upload", { method: "POST", body: form });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      toast(payload.error ?? "Upload failed", "error");
    } else {
      toast(`${file.name} uploaded`, "success");
      void load(path);
    }
  };

  const crumbs = path ? path.split("/") : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Files</h1>
          <p className="mt-0.5 text-xs text-ink2">Server data directory — world, configs, mods, logs</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={uploadRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <Button disabled={managed} size="sm" onClick={() => uploadRef.current?.click()}>
            <Upload size={13} /> Upload here
          </Button>
          <Button disabled={managed} size="sm" onClick={() => setMkdirOpen(true)}>
            <FolderPlus size={13} /> New folder
          </Button>
        </div>
      </div>

      {/* breadcrumbs */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button onClick={() => setPath("")} className="flex items-center gap-1 text-ink2 hover:text-ink">
          <Home size={13} /> data
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-muted" />
            <button
              onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
              className={i === crumbs.length - 1 ? "font-medium text-ink" : "text-ink2 hover:text-ink"}
            >
              {c}
            </button>
          </span>
        ))}
      </div>

      {error && <div className="rounded-xl border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">{error}</div>}

      <Card pad={false}>
        {entries === null ? (
          <EmptyState title="Loading…" />
        ) : entries.length === 0 && !error ? (
          <EmptyState icon={<Folder size={28} />} title="Empty folder" />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {entries.map((e) => (
                <tr key={e.name} className="border-b border-border/50 last:border-0 hover:bg-surface2">
                  <td className="cursor-pointer px-4 py-2" onClick={() => void open(e)}>
                    <span className="flex items-center gap-2.5">
                      {e.type === "dir" ? (
                        <Folder size={15} className="text-series1" />
                      ) : (
                        <FileIcon size={15} className="text-muted" />
                      )}
                      <span className={e.type === "dir" ? "font-medium" : ""}>{e.name}</span>
                    </span>
                  </td>
                  <td className="w-28 px-4 py-2 text-xs text-muted">{e.type === "file" ? fmtBytes(e.size) : "—"}</td>
                  <td className="w-40 px-4 py-2 text-xs text-muted">{fmtDateTime(e.mtime)}</td>
                  <td className="w-24 px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {e.type === "file" && (
                        <a
                          href={`/api/files/download?path=${encodeURIComponent(path ? `${path}/${e.name}` : e.name)}`}
                          className="rounded p-1 text-muted hover:text-ink"
                          title="Download"
                        >
                          <Download size={13} />
                        </a>
                      )}
                      <button
                        disabled={managed}
                        onClick={() => setConfirmDelete(e)}
                        className="rounded p-1 text-muted hover:text-crit"
                        title={e.type === "dir" ? "Delete (empty folders only)" : "Delete"}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 md:p-10">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2 font-mono text-sm">
                {editing.path}
                {editing.dirty && <span className="text-warn">●</span>}
                {editing.truncated && <span className="text-[10px] text-warn">(truncated — file over 2 MB)</span>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={save} busy={saving} disabled={managed || !editing.dirty || editing.truncated}>
                  <Save size={13} /> Save
                </Button>
                <Button size="sm" onClick={() => setEditing(null)}>
                  <X size={13} /> Close
                </Button>
              </div>
            </header>
            <div className="scroll-slim min-h-0 flex-1 overflow-auto">
              <CodeMirror
                editable={!managed}
                readOnly={managed}
                value={editing.content}
                onChange={(v) => setEditing((e) => (e ? { ...e, content: v, dirty: true } : e))}
                extensions={langFor(editing.path)}
                theme={oneDark}
                height="100%"
                style={{ fontSize: 12, height: "100%" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* new folder modal */}
      <Modal open={mkdirOpen} onClose={() => setMkdirOpen(false)} title="New folder">
        <Input
          value={mkdirName}
          onChange={(e) => setMkdirName(e.target.value)}
          placeholder="folder name"
          className="w-full"
          onKeyDown={async (e) => {
            if (e.key === "Enter" && mkdirName.trim()) {
              await api("/api/files", {
                body: { op: "mkdir", path: path ? `${path}/${mkdirName.trim()}` : mkdirName.trim() },
              });
              setMkdirOpen(false);
              setMkdirName("");
              void load(path);
            }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setMkdirOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!mkdirName.trim()) return;
              await api("/api/files", {
                body: { op: "mkdir", path: path ? `${path}/${mkdirName.trim()}` : mkdirName.trim() },
              });
              setMkdirOpen(false);
              setMkdirName("");
              void load(path);
            }}
          >
            Create
          </Button>
        </div>
      </Modal>

      {/* delete confirm */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={`Delete ${confirmDelete?.name}?`}>
        <p className="text-sm text-ink2">
          {confirmDelete?.type === "dir"
            ? "Only empty folders can be deleted from the panel."
            : "This permanently deletes the file from the server data directory."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const e = confirmDelete!;
              setConfirmDelete(null);
              try {
                await api("/api/files", { body: { op: "delete", path: path ? `${path}/${e.name}` : e.name } });
                toast(`${e.name} deleted`, "warn");
                void load(path);
              } catch (err) {
                toast((err as Error).message, "error");
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
