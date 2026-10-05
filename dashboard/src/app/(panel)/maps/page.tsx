"use client";
import { useState } from "react";
import Link from "next/link";
import { Map, ExternalLink, RefreshCw, Layers } from "lucide-react";
import { useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Select } from "@/components/ui";
import type { NetworkView } from "@/lib/network";
export default function MapsPage() {
  const { data, error, loading } = useApi<NetworkView>("/api/network", 15000);
  const [id, setId] = useState("");
  const [reload, setReload] = useState(0);
  const maps = data?.profiles.filter((p) => p.map !== "none") ?? [];
  const selected = maps.find((p) => p.id === id) ?? maps[0];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-accent">
            CraftDeck / Atlas
          </div>
          <h1 className="text-2xl font-bold">Live world maps</h1>
          <p className="mt-2 text-sm text-ink2">
            Explore terrain, follow players, and view the overlays supplied by
            your map renderer.
          </p>
        </div>
        <Link href="/network" className="text-sm text-accent">
          Configure maps →
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-muted">Loading maps…</p>}
      {!!maps.length && (
        <div className="flex flex-wrap items-center gap-3">
          <Layers size={16} className="text-accent" />
          <Select
            value={selected?.id ?? ""}
            onChange={setId}
            options={maps.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Badge color="info">
            {selected?.map === "bluemap"
              ? "BlueMap · 3D"
              : "Dynmap · 2D / isometric"}
          </Badge>
          <span className="text-xs text-muted">
            {selected?.version} · {selected?.loader}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setReload((x) => x + 1)}>
              <RefreshCw size={13} />
              Reload
            </Button>
            {selected?.mapUrl && (
              <a
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs"
                href={selected.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={13} />
                Open full map
              </a>
            )}
          </div>
        </div>
      )}
      {selected?.mapUrl ? (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <iframe
              key={`${selected.id}-${reload}`}
              title={`${selected.name} live map`}
              src={selected.mapUrl}
              className="h-[70vh] min-h-96 w-full"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups"
              referrerPolicy="no-referrer"
              allowFullScreen
            />
          </div>
          <p className="text-xs text-muted">
            The map is served by {selected.map}. If the frame is blank, open the
            full map and check HTTPS, renderer startup, reverse proxy settings,
            and framing policy. A loaded frame alone does not verify renderer
            health.
          </p>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Map size={40} />}
            title={
              selected
                ? "Connect this map to its web address"
                : "Your worlds, from a different perspective"
            }
            hint={
              selected
                ? `Publish loopback port ${selected.mapPort} through an HTTPS reverse proxy, then save the browser URL in this server’s Live web map settings.`
                : "Create a world server with BlueMap or Dynmap, deploy a compatible renderer, and add its browser URL."
            }
          />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Terrain & dimensions",
            body: "The renderer builds real tiles or 3D geometry from your server’s worlds. Initial rendering takes time and uses CPU, disk, and memory.",
          },
          {
            title: "Live player locations",
            body: "Enable player visibility in the renderer and configure permissions. Players, caves, and hidden areas follow its privacy settings.",
          },
          {
            title: "Claims & markers",
            body: "Claim boundaries need a compatible integration for your claims plugin. Configure the addon on the server; its overlays appear here automatically.",
          },
        ].map((x) => (
          <Card key={x.title} title={x.title}>
            <p className="text-xs leading-relaxed text-ink2">{x.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
