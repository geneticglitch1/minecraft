"use client";

import { useState } from "react";
import { Sun, Moon, CloudSun, CloudRain, Megaphone, Monitor } from "lucide-react";
import { api, useApi, toast } from "@/lib/api";
import { Card, Button, Input, Select, Toggle } from "@/components/ui";

// Canonical 26.x snake_case keys; the backend resolves old camelCase names
// automatically on older servers.
const GAMERULE_LABELS: Record<string, string> = {
  keep_inventory: "Keep inventory on death",
  mob_griefing: "Mob griefing (creeper damage…)",
  advance_time: "Day/night cycle",
  advance_weather: "Weather cycle",
  pvp: "PvP",
};

/** One-click admin controls; shown on the Overview when the server runs. */
export function QuickControls({ running }: { running: boolean }) {
  const { data, refresh } = useApi<{ gamerules: Record<string, boolean> }>("/api/admin", 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState("");
  const [broadcastStyle, setBroadcastStyle] = useState<"chat" | "title">("chat");
  const [difficulty, setDifficulty] = useState("");

  const run = async (label: string, body: Record<string, unknown>, message?: string) => {
    setBusy(label);
    try {
      await api("/api/admin", { body });
      if (message) toast(message, "success");
      void refresh();
    } catch (err) {
      toast((err as Error).message, "error");
      void refresh();
    } finally {
      setBusy(null);
    }
  };

  const sendBroadcast = () => {
    if (!broadcast.trim()) return;
    void run(
      "broadcast",
      { op: "broadcast", message: broadcast, style: broadcastStyle },
      broadcastStyle === "title" ? "Title shown to everyone" : "Broadcast sent"
    );
    setBroadcast("");
  };

  if (!running) return null;

  const rules = data?.gamerules ?? {};
  const rulesLoaded = Object.keys(rules).length > 0;

  return (
    <Card title="Quick controls">
      <div className="space-y-4">
        {/* time & weather */}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" busy={busy === "day"} onClick={() => void run("day", { op: "time", value: "day" }, "Time set to day")}>
            <Sun size={12} /> Day
          </Button>
          <Button size="sm" busy={busy === "night"} onClick={() => void run("night", { op: "time", value: "night" }, "Time set to night")}>
            <Moon size={12} /> Night
          </Button>
          <Button size="sm" busy={busy === "clear"} onClick={() => void run("clear", { op: "weather", value: "clear" }, "Weather cleared")}>
            <CloudSun size={12} /> Clear
          </Button>
          <Button size="sm" busy={busy === "rain"} onClick={() => void run("rain", { op: "weather", value: "rain" }, "Let it rain")}>
            <CloudRain size={12} /> Rain
          </Button>
          <Select
            value={difficulty}
            onChange={(v) => {
              setDifficulty(v);
              if (v) void run("difficulty", { op: "difficulty", value: v }, `Difficulty: ${v}`);
            }}
            options={[
              { value: "", label: "difficulty…" },
              { value: "peaceful", label: "peaceful" },
              { value: "easy", label: "easy" },
              { value: "normal", label: "normal" },
              { value: "hard", label: "hard" },
            ]}
          />
        </div>

        {/* gamerules */}
        <div className="border-t border-border pt-3">
          {!rulesLoaded ? (
            <p className="text-xs text-muted">Reading gamerules from the server…</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(GAMERULE_LABELS).map(([rule, label]) =>
                rule in rules ? (
                  <Toggle
                    key={rule}
                    checked={rules[rule]}
                    onChange={(v) =>
                      void run(`rule-${rule}`, { op: "gamerule", rule, value: v }, `${label}: ${v ? "on" : "off"}`)
                    }
                    label={label}
                  />
                ) : null
              )}
            </div>
          )}
        </div>

        {/* broadcast */}
        <div className="flex gap-2 border-t border-border pt-3">
          <Select
            value={broadcastStyle}
            onChange={(v) => setBroadcastStyle(v as "chat" | "title")}
            options={[
              { value: "chat", label: "💬 chat" },
              { value: "title", label: "🖥 big title" },
            ]}
          />
          <Input
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
            placeholder={
              broadcastStyle === "title"
                ? "Show a message across everyone's screen…"
                : "Broadcast a chat message to everyone…"
            }
            className="flex-1"
            maxLength={256}
          />
          <Button size="sm" variant="primary" disabled={!broadcast.trim()} busy={busy === "broadcast"} onClick={sendBroadcast}>
            {broadcastStyle === "title" ? <Monitor size={12} /> : <Megaphone size={12} />} Send
          </Button>
        </div>
      </div>
    </Card>
  );
}
