import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { ok, fail, handle, readJson } from "@/server/api";
import { assertDeploymentEditable } from "@/server/managed";
import { readNetwork, profileById } from "@/server/network-config";
import { networkFilePath } from "@/server/network-files";
import { assertNetworkIdle } from "@/server/network";
import { inspectContainer } from "@/server/docker";
import { withServerOperation } from "@/server/operation";
import { serverName } from "@/server/network-render";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return handle(async () => {
    const p = profileById(readNetwork(), req.nextUrl.searchParams.get("id"));
    const relative = req.nextUrl.searchParams.get("path") || "";
    const file = networkFilePath(p.id, relative);
    if (fs.statSync(file).isDirectory())
      return ok({
        entries: fs
          .readdirSync(file, { withFileTypes: true })
          .map((e) => ({
            name: e.name,
            directory: e.isDirectory(),
            link: e.isSymbolicLink(),
          })),
      });
    if (fs.statSync(file).size > 2 * 1024 * 1024)
      return fail("File exceeds the 2 MB editor limit");
    const data = fs.readFileSync(file);
    if (data.includes(0)) return fail("Binary files cannot be edited as text");
    return ok({ content: data.toString("utf8") });
  });
}
export async function POST(req: NextRequest) {
  return handle(() =>
    withServerOperation(async () => {
      assertDeploymentEditable();
      assertNetworkIdle();
      const isUpload = req.headers
        .get("content-type")
        ?.includes("multipart/form-data");
      if (Number(req.headers.get("content-length") || 0) > 100 * 1024 * 1024)
        return fail("Upload limit is 100 MB");
      const form = isUpload ? await req.formData() : null;
      const body = form
        ? { id: form.get("id"), path: form.get("path"), content: undefined }
        : await readJson<{ id: string; path: string; content: string }>(req);
      const p = profileById(readNetwork(), body.id);
      if ((await inspectContainer(serverName(p.id))).running)
        return fail("Stop this server before editing or uploading files", 409);
      const file = networkFilePath(p.id, body.path as string);
      // Terrain, player state, executable scripts and registry files are not text-editable.
      const allowed = /\.(json|ya?ml|toml|conf|properties|txt|cfg)$/i;
      let data: Buffer;
      if (form) {
        const upload = form.get("file");
        if (!(upload instanceof File) || upload.size > 100 * 1024 * 1024)
          return fail("Choose a file under 100 MB");
        const rel = path.relative(networkFilePath(p.id, ""), file);
        if (
          !/^(mods|plugins)\/[^/]+\.jar$/.test(rel) &&
          !/^world\/datapacks\/[^/]+\.zip$/.test(rel)
        )
          return fail(
            "Upload JARs into mods/plugins or ZIPs into world/datapacks",
          );
        if (fs.existsSync(file))
          return fail("A file already exists with this name");
        data = Buffer.from(await upload.arrayBuffer());
      } else {
        if (
          !allowed.test(file) ||
          typeof body.content !== "string" ||
          Buffer.byteLength(body.content) > 2 * 1024 * 1024
        )
          return fail("Choose a supported configuration file under 2 MB");
        data = Buffer.from(body.content);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data, { flag: form ? "wx" : "w" });
      try {
        fs.chownSync(file, 1000, 1000);
      } catch {}
      return ok({ saved: true });
    }),
  );
}
