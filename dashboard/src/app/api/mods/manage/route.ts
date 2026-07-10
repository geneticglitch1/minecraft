import { NextRequest } from "next/server";
import { addManagedMod, removeManagedMod, toggleMod, deleteModFile } from "@/server/modrinth";
import { logActivity } from "@/server/db";
import { ok, fail, readJson, handle } from "@/server/api";

type Body = {
  op: "add" | "remove" | "toggle" | "delete";
  slug?: string;
  file?: string;
};

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    switch (body.op) {
      case "add": {
        if (!body.slug) return fail("Missing slug");
        const managed = addManagedMod(body.slug);
        logActivity("mod_add", null, body.slug);
        return ok({ managed, needsApply: true });
      }
      case "remove": {
        if (!body.slug) return fail("Missing slug");
        const managed = removeManagedMod(body.slug);
        logActivity("mod_remove", null, body.slug);
        return ok({ managed, needsApply: true });
      }
      case "toggle": {
        if (!body.file) return fail("Missing file");
        toggleMod(body.file);
        return ok({ needsRestart: true });
      }
      case "delete": {
        if (!body.file) return fail("Missing file");
        deleteModFile(body.file);
        logActivity("mod_remove", null, body.file);
        return ok({ needsRestart: true });
      }
      default:
        return fail("Unknown operation");
    }
  });
}
