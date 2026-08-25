import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * Lightweight unread counter for the bottom-nav badge. Polled from the whole
 * dashboard, so it stays a single cheap COUNT and never returns 401 noise.
 */
export async function GET() {
  // Keeps the benign {new:0} body on 401 — the nav badge poller reads this
  // shape and would break on an {error} envelope.
  try { await requireOwner(); } catch { return Response.json({ new: 0 }, { status: 401 }); }
  try {
    const rows = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM inbox_messages WHERE status = 'new'`,
    );
    return Response.json({ new: Number(rows[0]?.n ?? 0) });
  } catch {
    return Response.json({ new: 0 });
  }
}
