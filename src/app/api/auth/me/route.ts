import { headers } from "next/headers";
import { requireMember } from "@/lib/guard";

/**
 * Who am I? The mini app shell calls this on mount and on a heartbeat.
 *
 * It used to answer a bare `{ ok: true }`, which was enough when there was one
 * person. Now it carries the role, because that is what decides which shell the
 * caller gets.
 */
export async function GET() {
  try {
    const s = await requireMember();
    await headers(); // keep this route dynamic
    return Response.json({
      ok: true,
      role: s.role,
      name: s.displayName,
      memberId: s.memberId,
    });
  } catch {
    return Response.json({ ok: false }, { status: 401 });
  }
}
