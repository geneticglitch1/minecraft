import { NextRequest } from "next/server";
import path from "node:path";
import { writeBinaryFile } from "@/server/files";
import { ok, fail, handle } from "@/server/api";

const MAX_UPLOAD = 256 * 1024 * 1024; // mod jars and datapacks, not world dumps

export async function POST(req: NextRequest) {
  return handle(async () => {
    const form = await req.formData();
    const dir = (form.get("dir") as string) ?? "";
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Missing file");
    if (file.size > MAX_UPLOAD) return fail("File too large (256 MB max)");
    const name = path.basename(file.name);
    if (!name || name.startsWith(".")) return fail("Invalid file name");
    const buf = Buffer.from(await file.arrayBuffer());
    writeBinaryFile(path.join(dir, name), buf);
    return ok({ uploaded: name, size: file.size });
  });
}
