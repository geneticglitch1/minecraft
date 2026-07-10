import { applyMcConfig } from "@/server/compose";
import { notify } from "@/server/notify";
import { ok, fail, handle } from "@/server/api";

/** Recreate the mc container so the itzg image re-resolves MODRINTH_PROJECTS. */
export async function POST() {
  return handle(async () => {
    const res = await applyMcConfig();
    if (!res.ok) {
      notify("error", "Mod apply failed", res.output.slice(-800));
      return fail(`compose failed: ${res.output.slice(-400)}`, 500);
    }
    notify("success", "Mod changes applied", "Server container recreated; mods re-resolved.", { discord: false });
    return ok({ output: res.output.slice(-1000) });
  });
}
