import { notify } from "@/server/notify";
import { ok, handle } from "@/server/api";

export async function POST() {
  return handle(async () => {
    notify("info", "Test notification", "If you can read this in Discord, the webhook works. 🎉");
    return ok({ sent: true });
  });
}
