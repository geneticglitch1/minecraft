/**
 * Stateless signed-cookie sessions. Implemented with the Web Crypto API only,
 * so the exact same code runs in the Edge middleware and Node route handlers.
 * Token format: base64url(payload-json) + "." + base64url(hmac-sha256).
 */

export const SESSION_COOKIE = "craftdeck_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = { u: string; iat: number; exp: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(secret: string, username: string): Promise<string> {
  const payload: SessionPayload = { u: username, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      b64urlDecode(sig) as unknown as ArrayBuffer,
      enc.encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieAttributes(): string {
  // Secure flag intentionally omitted: the panel runs over plain HTTP on a
  // trusted LAN/VPN (see docs/networking.md). Add TLS + Secure if exposing it.
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}
