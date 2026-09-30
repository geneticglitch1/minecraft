import { env } from "@/server/env";
import { ok } from "@/server/api";

export const dynamic = "force-dynamic";
export function GET() { return ok({ managed: env.managed }); }
