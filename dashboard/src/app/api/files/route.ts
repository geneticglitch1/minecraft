import { NextRequest } from "next/server";
import { listDir, readTextFile, writeTextFile, deletePath, makeDir } from "@/server/files";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const dir = req.nextUrl.searchParams.get("dir");
    const file = req.nextUrl.searchParams.get("file");
    if (file !== null) return ok(readTextFile(file));
    return ok(listDir(dir ?? ""));
  });
}

type Body =
  | { op: "write"; path: string; content: string }
  | { op: "mkdir"; path: string }
  | { op: "delete"; path: string };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    if (!body.path && body.path !== "") return fail("Missing path");
    switch (body.op) {
      case "write":
        writeTextFile(body.path, body.content ?? "");
        return ok({ written: body.path });
      case "mkdir":
        makeDir(body.path);
        return ok({ created: body.path });
      case "delete":
        deletePath(body.path);
        return ok({ deleted: body.path });
      default:
        return fail("Unknown operation");
    }
  });
}
