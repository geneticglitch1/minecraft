import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/health"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.PANEL_SESSION_SECRET || "craftdeck-dev-secret-do-not-use";
  const session = await verifySessionToken(secret, token);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
