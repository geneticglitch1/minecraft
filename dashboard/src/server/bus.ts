import { EventEmitter } from "node:events";

/**
 * In-process event bus for fanning out live data to SSE subscribers.
 * Events:
 *   "log"          (line: string)                  raw server console line
 *   "mc-event"     (e: McEvent)                    parsed game event
 *   "metrics"      (m: Record<string, unknown>)    fresh sampler tick
 *   "notification" (n: Record<string, unknown>)    new panel notification
 */
export type McEvent = {
  ts: number;
  type: string;
  player?: string;
  detail?: string;
};

const g = globalThis as unknown as { __craftdeckBus?: EventEmitter };

export function bus(): EventEmitter {
  if (!g.__craftdeckBus) {
    const e = new EventEmitter();
    e.setMaxListeners(100); // one listener per open SSE connection
    g.__craftdeckBus = e;
  }
  return g.__craftdeckBus;
}

/** Ring buffer of recent console lines so new SSE clients get instant backfill. */
const gl = globalThis as unknown as { __craftdeckLogRing?: string[] };

export function logRing(): string[] {
  if (!gl.__craftdeckLogRing) gl.__craftdeckLogRing = [];
  return gl.__craftdeckLogRing;
}

export function pushLogLine(line: string) {
  const ring = logRing();
  ring.push(line);
  if (ring.length > 500) ring.splice(0, ring.length - 500);
  bus().emit("log", line);
}
