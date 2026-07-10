import fs from "node:fs";
import { execFile } from "node:child_process";
import { inspectContainer, containerStats } from "./docker";
import { listOnlinePlayers, sparkTps, sparkPings } from "./mc";
import { db } from "./db";
import { bus } from "./bus";
import { notify } from "./notify";
import { env } from "./env";

/**
 * Periodic metrics collection into the panel DB (ring buffer with retention)
 * plus threshold alerts: server offline/crash, sustained low TPS, low disk.
 */

type SamplerState = {
  timer: NodeJS.Timeout | null;
  tick: number;
  lastRunning: boolean | null;
  cachedTps: number | null;
  cachedMspt: number | null;
  lowTpsStreak: number;
  lastTpsAlert: number;
  lastDiskAlert: number;
  worldSizeBytes: number | null;
};

const g = globalThis as unknown as { __craftdeckSampler?: SamplerState };

const INTERVAL_MS = 10_000;

async function sampleTick(state: SamplerState) {
  state.tick++;
  let running = false;
  try {
    const c = await inspectContainer(env.mcContainer);
    running = c.running;

    // online/offline transitions → alerts
    if (state.lastRunning !== null && state.lastRunning !== running) {
      if (!running) {
        if ((c.exitCode ?? 0) !== 0) {
          notify("error", "Server crashed", `Container exited with code ${c.exitCode}`);
        } else {
          notify("warn", "Server stopped");
        }
      }
    }
    state.lastRunning = running;
  } catch {
    // docker unavailable — nothing to sample
    return;
  }

  const ts = Date.now();
  let cpu: number | null = null;
  let memUsed: number | null = null;
  let memLimit: number | null = null;
  let netRx: number | null = null;
  let netTx: number | null = null;
  let players: number | null = null;

  if (running) {
    try {
      const s = await containerStats(env.mcContainer);
      cpu = Math.round(s.cpuPercent * 10) / 10;
      memUsed = s.memUsed;
      memLimit = s.memLimit;
      netRx = s.netRx;
      netTx = s.netTx;
    } catch {}
    try {
      players = (await listOnlinePlayers()).online;
    } catch {}

    // spark TPS every 3rd tick (30s)
    if (state.tick % 3 === 0) {
      const t = await sparkTps();
      state.cachedTps = t.tps;
      state.cachedMspt = t.mspt;
      if (t.tps !== null && t.tps < 15) {
        state.lowTpsStreak++;
        if (state.lowTpsStreak >= 3 && ts - state.lastTpsAlert > 15 * 60 * 1000) {
          state.lastTpsAlert = ts;
          notify("warn", "Server is lagging", `TPS dropped to ${t.tps.toFixed(1)} (target 20)`);
        }
      } else {
        state.lowTpsStreak = 0;
      }
    }

    // per-player pings every 6th tick (60s)
    if (state.tick % 6 === 0) {
      const pings = await sparkPings();
      const insert = db().prepare("INSERT INTO ping_samples(ts, player, ping) VALUES(?, ?, ?)");
      for (const [player, ping] of Object.entries(pings)) insert.run(ts, player, ping);
    }
  } else {
    state.cachedTps = null;
    state.cachedMspt = null;
  }

  // disk stats every tick (cheap statfs)
  let diskUsed: number | null = null;
  let diskFree: number | null = null;
  try {
    const st = fs.statfsSync(env.mcDataDir);
    diskFree = st.bavail * st.bsize;
    diskUsed = (st.blocks - st.bfree) * st.bsize;
    if (diskFree < 2 * 1024 ** 3 && ts - state.lastDiskAlert > 6 * 60 * 60 * 1000) {
      state.lastDiskAlert = ts;
      notify("error", "Low disk space", `Only ${(diskFree / 1024 ** 3).toFixed(1)} GB free`);
    }
  } catch {}

  // world folder size every 60th tick (10 min) — du can be slow
  if (state.tick % 60 === 1) {
    execFile("du", ["-sk", env.mcDataDir], { timeout: 60_000 }, (err, stdout) => {
      if (!err) {
        const kb = parseInt(stdout.split("\t")[0], 10);
        if (!Number.isNaN(kb)) state.worldSizeBytes = kb * 1024;
      }
    });
  }

  db()
    .prepare(
      `INSERT OR REPLACE INTO metrics(ts, cpu, mem_used, mem_limit, net_rx, net_tx, tps, mspt, players, disk_used, disk_free)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ts, cpu, memUsed, memLimit, netRx, netTx, state.cachedTps, state.cachedMspt, players, diskUsed, diskFree);

  bus().emit("metrics", {
    ts,
    running,
    cpu,
    memUsed,
    memLimit,
    tps: state.cachedTps,
    mspt: state.cachedMspt,
    players,
    diskFree,
  });

  // retention pruning hourly
  if (state.tick % 360 === 2) {
    const week = ts - 7 * 24 * 60 * 60 * 1000;
    const month = ts - 30 * 24 * 60 * 60 * 1000;
    db().prepare("DELETE FROM metrics WHERE ts < ?").run(week);
    db().prepare("DELETE FROM ping_samples WHERE ts < ?").run(week);
    db().prepare("DELETE FROM activity WHERE ts < ?").run(month);
    db().prepare("DELETE FROM notifications WHERE ts < ?").run(month);
  }
}

export function startSampler() {
  if (g.__craftdeckSampler) return;
  const state: SamplerState = {
    timer: null,
    tick: 0,
    lastRunning: null,
    cachedTps: null,
    cachedMspt: null,
    lowTpsStreak: 0,
    lastTpsAlert: 0,
    lastDiskAlert: 0,
    worldSizeBytes: null,
  };
  g.__craftdeckSampler = state;
  state.timer = setInterval(() => void sampleTick(state).catch(() => {}), INTERVAL_MS);
  void sampleTick(state).catch(() => {});
}

export function getWorldSizeBytes(): number | null {
  return g.__craftdeckSampler?.worldSizeBytes ?? null;
}
