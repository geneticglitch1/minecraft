import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { getBackupStream, deleteBackup } from "@/server/backups";
import { ok, fail, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return fail("Missing backup name");
  try {
    const { stream, size } = getBackupStream(name);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    return fail((err as Error).message, 404);
  }
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const name = req.nextUrl.searchParams.get("name");
    if (!name) return fail("Missing backup name");
    deleteBackup(name);
    return ok({ deleted: name });
  });
}
