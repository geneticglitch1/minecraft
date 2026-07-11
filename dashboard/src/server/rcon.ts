import net from "node:net";
import { env } from "./env";

/**
 * Minimal Source-RCON client (the protocol Minecraft uses). One persistent
 * connection, commands serialized through a queue, automatic reconnect.
 * Long responses arrive as multiple packets with the same request id; we
 * collect until a short quiet period.
 */

const TYPE_AUTH = 3;
const TYPE_COMMAND = 2;

export class RconError extends Error {
  constructor(message: string, public kind: "offline" | "auth" | "timeout" = "offline") {
    super(message);
  }
}

function encodePacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + bodyBuf.length);
  buf.writeInt32LE(10 + bodyBuf.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  return buf;
}

type Pending = {
  id: number;
  chunks: string[];
  resolve: (out: string) => void;
  reject: (err: Error) => void;
  quietTimer?: NodeJS.Timeout;
  hardTimer: NodeJS.Timeout;
};

class RconClient {
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private authed = false;
  private authWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private pending: Pending | null = null;
  private queue: Array<() => void> = [];

  private connect(): Promise<void> {
    if (this.authed && this.socket && !this.socket.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.teardown();
      const socket = net.createConnection({ host: env.rconHost, port: env.rconPort });
      this.socket = socket;
      const connectTimeout = setTimeout(() => {
        socket.destroy();
        reject(new RconError("RCON connect timeout"));
      }, 5000);
      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        this.authWaiter = { resolve, reject };
        socket.write(encodePacket(0, TYPE_AUTH, env.rconPassword));
      });
      socket.on("data", (chunk: Buffer) => this.onData(chunk));
      socket.on("error", (err) => {
        clearTimeout(connectTimeout);
        const e = new RconError(`RCON unavailable: ${(err as Error).message}`);
        this.failAll(e);
        reject(e);
      });
      socket.on("close", () => {
        this.authed = false;
        this.failAll(new RconError("RCON connection closed"));
      });
    });
  }

  private teardown() {
    this.socket?.destroy();
    this.socket = null;
    this.authed = false;
    this.buffer = Buffer.alloc(0);
  }

  private failAll(err: Error) {
    this.authWaiter?.reject(err);
    this.authWaiter = null;
    if (this.pending) {
      clearTimeout(this.pending.hardTimer);
      if (this.pending.quietTimer) clearTimeout(this.pending.quietTimer);
      this.pending.reject(err);
      this.pending = null;
    }
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + len) break;
      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.subarray(12, 4 + len - 2).toString("utf8");
      this.buffer = this.buffer.subarray(4 + len);

      if (this.authWaiter) {
        if (id === -1) {
          this.authWaiter.reject(new RconError("RCON auth failed — wrong password", "auth"));
          this.authWaiter = null;
          this.teardown();
        } else {
          this.authed = true;
          this.authWaiter.resolve();
          this.authWaiter = null;
        }
        continue;
      }

      const p = this.pending;
      if (p && id === p.id) {
        p.chunks.push(body);
        if (p.quietTimer) clearTimeout(p.quietTimer);
        p.quietTimer = setTimeout(() => this.finish(), 150);
      }
    }
  }

  private finish() {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.hardTimer);
    this.pending = null;
    p.resolve(p.chunks.join(""));
    this.drain();
  }

  private drain() {
    const next = this.queue.shift();
    if (next) next();
  }

  private execOnce(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        try {
          await this.connect();
        } catch (err) {
          reject(err);
          this.drain();
          return;
        }
        const id = this.nextId++;
        this.pending = {
          id,
          chunks: [],
          resolve,
          reject,
          hardTimer: setTimeout(() => {
            this.pending = null;
            // A timeout usually means the connection went stale (server
            // restarted, long idle). Drop it so the next attempt reconnects.
            this.teardown();
            reject(new RconError("RCON command timeout", "timeout"));
            this.drain();
          }, 10_000),
        };
        this.socket!.write(encodePacket(id, TYPE_COMMAND, command));
      };
      if (this.pending || this.queue.length > 0) this.queue.push(run);
      else void run();
    });
  }

  /**
   * Run a command, retrying once on a fresh connection if the first attempt
   * fails. A panel that sits idle overnight often holds a dead TCP socket
   * (server restart, container recreate) — the first write then times out or
   * errors even though the server is fine.
   */
  async exec(command: string): Promise<string> {
    try {
      return await this.execOnce(command);
    } catch (err) {
      if (!(err instanceof RconError) || err.kind === "auth") throw err;
      this.teardown();
      return this.execOnce(command);
    }
  }
}

const g = globalThis as unknown as { __craftdeckRcon?: RconClient };

export function rcon(): RconClient {
  if (!g.__craftdeckRcon) g.__craftdeckRcon = new RconClient();
  return g.__craftdeckRcon;
}

/** Strip Minecraft § color/formatting codes from RCON output. */
export function stripColors(s: string): string {
  return s.replace(/§[0-9a-fk-or]/gi, "");
}
