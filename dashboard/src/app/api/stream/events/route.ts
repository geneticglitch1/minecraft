import { NextRequest } from "next/server";
import { bus } from "@/server/bus";

export const dynamic = "force-dynamic";

/**
 * Multiplexed live event stream (SSE) for the UI: sampler metrics ticks,
 * parsed game events, and new notifications.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const onMetrics = (m: unknown) => send("metrics", m);
      const onEvent = (e: unknown) => send("mc-event", e);
      const onNotification = (n: unknown) => send("notification", n);
      bus().on("metrics", onMetrics);
      bus().on("mc-event", onEvent);
      bus().on("notification", onNotification);
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
        bus().off("metrics", onMetrics);
        bus().off("mc-event", onEvent);
        bus().off("notification", onNotification);
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
