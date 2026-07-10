import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { fileStream } from "@/server/files";
import { fail } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("path");
  if (!p) return fail("Missing path");
  try {
    const { stream, size, name } = fileStream(p);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    return fail((err as Error).message, 404);
  }
}
