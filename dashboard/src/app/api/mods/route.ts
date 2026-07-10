import { listInstalledMods, managedSlugs, currentMcVersion } from "@/server/modrinth";
import { ok, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    return ok({
      installed: await listInstalledMods(),
      managed: managedSlugs(),
      mcVersion: currentMcVersion(),
    });
  });
}
