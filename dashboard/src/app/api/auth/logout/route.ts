import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  return res;
}
