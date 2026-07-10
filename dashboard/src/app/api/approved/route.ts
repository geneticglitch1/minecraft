import { NextRequest } from "next/server";
import {
  listApproved,
  approvePlayer,
  revokePlayer,
  reopenWindow,
  resetPassword,
  forceReregister,
  importFromWhitelist,
} from "@/server/authflow";
import { whitelistList, easyauthList } from "@/server/mc";
import { ok, fail, readJson, handle } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    let whitelist: string[] | null = null;
    let registered: string[] | null = null;
    try {
      whitelist = await whitelistList();
    } catch {}
    try {
      registered = await easyauthList();
    } catch {}
    return ok({ approved: listApproved(), whitelist, registered });
  });
}

type Body = {
  op: "approve" | "revoke" | "reopen" | "reset-password" | "force-reregister" | "import-whitelist";
  username?: string;
  note?: string;
};

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    switch (body.op) {
      case "approve": {
        if (!body.username) return fail("Username required");
        const player = await approvePlayer(body.username.trim(), body.note);
        return ok(player);
      }
      case "revoke": {
        if (!body.username) return fail("Username required");
        await revokePlayer(body.username);
        return ok({ revoked: true });
      }
      case "reopen": {
        if (!body.username) return fail("Username required");
        await reopenWindow(body.username);
        return ok({ reopened: true });
      }
      case "reset-password": {
        if (!body.username) return fail("Username required");
        const temp = await resetPassword(body.username);
        return ok({ tempPassword: temp });
      }
      case "force-reregister": {
        if (!body.username) return fail("Username required");
        await forceReregister(body.username);
        return ok({ pending: true });
      }
      case "import-whitelist": {
        const added = await importFromWhitelist();
        return ok({ imported: added });
      }
      default:
        return fail("Unknown operation");
    }
  });
}
