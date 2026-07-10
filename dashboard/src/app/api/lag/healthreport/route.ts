import { sparkHealthReport } from "@/server/mc";
import { ok, handle } from "@/server/api";

export async function POST() {
  return handle(async () => {
    const report = await sparkHealthReport();
    return ok({ report });
  });
}
