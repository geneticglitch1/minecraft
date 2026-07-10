"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mustChange: boolean }>("/api/auth/login", { body: { username, password } });
      router.push(res.mustChange ? "/settings" : "/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <svg viewBox="0 0 32 32" className="h-12 w-12">
            <rect width="32" height="32" rx="7" fill="#11161d" />
            <rect x="7" y="7" width="8" height="8" fill="#4ade80" />
            <rect x="17" y="7" width="8" height="8" fill="#199e70" />
            <rect x="7" y="17" width="8" height="8" fill="#199e70" />
            <rect x="17" y="17" width="8" height="8" fill="#166534" />
          </svg>
          <h1 className="text-lg font-bold">CraftDeck</h1>
          <p className="text-xs text-muted">Sign in to manage your Minecraft server</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink2">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink2">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              className="w-full"
            />
          </div>
          {error && <div className="rounded-lg bg-crit/10 px-3 py-2 text-xs text-crit">{error}</div>}
          <Button type="submit" variant="primary" busy={busy} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          First run? The initial password is in your <code>.env</code> (PANEL_ADMIN_PASSWORD)
          <br />
          or printed in the dashboard container logs.
        </p>
      </div>
    </div>
  );
}
