"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new ApiError("Unauthorized", 401);
  }
  let payload: { ok?: boolean; data?: T; error?: string };
  try {
    payload = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  if (!res.ok || payload.ok === false) {
    throw new ApiError(payload.error ?? `Request failed (${res.status})`, res.status);
  }
  return payload.data as T;
}

/** Poll a GET endpoint; refresh() for manual refetch. */
export function useApi<T>(path: string, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const d = await api<T>(path);
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError((err as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void refresh();
    const timer = intervalMs > 0 ? setInterval(() => void refresh(), intervalMs) : null;
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}

/** Subscribe to a server-sent-events endpoint. Reconnects automatically. */
export function useSSE(path: string, handlers: Record<string, (data: unknown) => void>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const source = new EventSource(path);
    const names = Object.keys(handlersRef.current);
    const bound: Array<[string, (e: MessageEvent) => void]> = [];
    for (const name of names) {
      const fn = (e: MessageEvent) => {
        try {
          handlersRef.current[name]?.(JSON.parse(e.data));
        } catch {}
      };
      bound.push([name, fn]);
      if (name === "message") source.onmessage = fn;
      else source.addEventListener(name, fn);
    }
    return () => {
      for (const [name, fn] of bound) {
        if (name !== "message") source.removeEventListener(name, fn);
      }
      source.close();
    };
  }, [path]);
}

// ── toasts (event-based so any code can raise one) ─────────────────────

export type ToastLevel = "info" | "success" | "warn" | "error";

export function toast(message: string, level: ToastLevel = "info") {
  window.dispatchEvent(new CustomEvent("craftdeck-toast", { detail: { message, level } }));
}
