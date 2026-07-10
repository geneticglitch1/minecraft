import { NextRequest } from "next/server";
import { bus, logRing } from "@/server/bus";

export const dynamic = "force-dynamic";

/** Live console stream (SSE). Backfills recent lines, then follows. */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (line: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
        } catch {
          closed = true;
        }
      };
      for (const line of logRing()) send(line);
      const onLog = (line: string) => send(line);
      bus().on("log", onLog);
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
      }, 15000);
      req.signal.addEventListener("abort", () => {
        closed = true;
        bus().off("log", onLog);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
