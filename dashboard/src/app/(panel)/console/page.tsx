"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizonal, ArrowDownToLine, Eraser } from "lucide-react";
import { api, useSSE, toast } from "@/lib/api";
import { Button, Input } from "@/components/ui";

const QUICK_COMMANDS = [
  "list",
  "whitelist list",
  "auth list",
  "spark tps",
  "save-all",
  "time set day",
  "weather clear",
];

function colorFor(line: string): string {
  if (/ERROR|FATAL|Exception|Crash/i.test(line)) return "text-crit";
  if (/WARN/i.test(line)) return "text-warn";
  if (/joined the game|registered|Done \(/.test(line)) return "text-good";
  if (line.startsWith("> ")) return "text-accent";
  return "text-ink2";
}

export default function ConsolePage() {
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useSSE("/api/stream/logs", {
    message: (line) => {
      setLines((xs) => {
        const next = [...xs, line as string];
        return next.length > 1500 ? next.slice(-1200) : next;
      });
    },
  });

  useEffect(() => {
    if (follow && paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight;
    }
  }, [lines, follow]);

  const onScroll = () => {
    const el = paneRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setFollow(atBottom);
  };

  const send = async (cmd?: string) => {
    const c = (cmd ?? command).trim();
    if (!c) return;
    setBusy(true);
    try {
      await api("/api/console", { body: { command: c } });
      setHistory((h) => [c, ...h.filter((x) => x !== c)].slice(0, 50));
      setHistIdx(-1);
      setCommand("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void send();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      if (history[next]) {
        setHistIdx(next);
        setCommand(history[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setCommand(next >= 0 ? history[next] : "");
    }
  };

  const visible = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Console</h1>
          <p className="mt-0.5 text-xs text-ink2">Live server log with RCON command input</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter lines…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48"
          />
          <Button size="sm" onClick={() => setLines([])}>
            <Eraser size={13} /> Clear
          </Button>
          {!follow && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setFollow(true);
                paneRef.current?.scrollTo({ top: paneRef.current.scrollHeight });
              }}
            >
              <ArrowDownToLine size={13} /> Follow
            </Button>
          )}
        </div>
      </div>

      <div
        ref={paneRef}
        onScroll={onScroll}
        className="scroll-slim flex-1 overflow-y-auto rounded-xl border border-border bg-[#070a0e] p-3 font-mono text-[12px] leading-[1.55]"
      >
        {visible.length === 0 && (
          <div className="py-10 text-center text-muted">
            Waiting for log output… (is the server running?)
          </div>
        )}
        {visible.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap break-all ${colorFor(line)}`}>
            {line}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-accent">
              &gt;
            </span>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a server command… (↑ for history)"
              className="w-full pl-7 font-mono"
              spellCheck={false}
            />
          </div>
          <Button variant="primary" onClick={() => void send()} busy={busy}>
            <SendHorizonal size={14} /> Send
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((c) => (
            <button
              key={c}
              onClick={() => void send(c)}
              className="rounded-md border border-border bg-surface2 px-2 py-0.5 font-mono text-[11px] text-ink2 hover:text-ink"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
