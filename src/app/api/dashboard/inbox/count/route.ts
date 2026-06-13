import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lightweight unread counter for the bottom-nav badge. Polled from the whole
 * dashboard, so it stays a single cheap COUNT and never returns 401 noise.
 */
export async function GET() {
  const s = await getSession();
  if (!s?.authenticated) return Response.json({ new: 0 }, { status: 401 });
  try {
    const rows = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM inbox_messages WHERE status = 'new'`,
    );
    return Response.json({ new: Number(rows[0]?.n ?? 0) });
  } catch {
    return Response.json({ new: 0 });
  }
}
