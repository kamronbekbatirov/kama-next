import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
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
  try { await requireOwner(); } catch { return UNAUTHORIZED(); }
  return Response.json(await getServerStatus());
}
