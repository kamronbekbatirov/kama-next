import { getSession } from "@/lib/auth";
import { getServerStatus } from "@/lib/server-status";

export const dynamic = "force-dynamic";

/**
 * Returns the latest full snapshot of host + services + domains + database +
 * ops, plus a derived "alerts" list.
 *
 * Single round-trip: the collector writes everything atomically every 30s.
 * Assembly + alert thresholds live in lib/server-status (shared with the
 * Claude assistant's get_server_status tool).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await getServerStatus());
}
