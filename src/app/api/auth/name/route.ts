import { requireMember, UNAUTHORIZED } from "@/lib/guard";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Change your own display name.
 *
 * Any member, including guests: the owner types a name when inviting someone,
 * but that is a label for the owner's own list, not the name that person wants
 * on the shared board. Scoped to the caller — there is no id here that could
 * rename anyone else.
 */
export async function PATCH(req: Request) {
  try {
    const s = await requireMember();
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return Response.json({ error: "name required" }, { status: 400 });

    await query("UPDATE members SET display_name = $2 WHERE id = $1", [s.memberId, name]);
    return Response.json({ ok: true, name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("auth/name:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
