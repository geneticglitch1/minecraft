"use client";
import { useApi } from "@/lib/api";

export function ManagedNotice() {
  const { data } = useApi<{ managed: boolean }>("/api/deployment", 0);
  if (!data?.managed) return null;
  return <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
    Managed deployment: versions, mods and files are read-only here. Update the reviewed
    deployment through Komodo. Console, player controls and backups remain available.
  </div>;
}
