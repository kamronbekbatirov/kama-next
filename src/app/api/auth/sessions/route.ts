import {
  getCurrentSid,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  dropCookie,
} from "@/lib/auth";
import { requireMember, UNAUTHORIZED } from "@/lib/guard";

/**
 * Your own signed-in devices.
 *
 * Every call is scoped to the calling member. Before members existed this
 * listed every session in the table and revoked any id it was handed — which
 * was harmless with one user and a way for a guest to sign the owner out
 * everywhere the moment there were two.
 */
export async function GET() {
  try {
    const s = await requireMember();
    return Response.json(await listSessions(s.memberId));
  } catch {
    return UNAUTHORIZED();
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireMember();
    const body = await req.json().catch(() => ({}));
    const currentSid = await getCurrentSid();
    let loggedOut = false;

    if (body.scope === "all") {
      await revokeAllSessions(s.memberId);
      await dropCookie(); // this device is included
      loggedOut = true;
    } else if (body.scope === "others") {
      await revokeOtherSessions(s.memberId);
    } else if (typeof body.id === "string" && body.id) {
      // Scoped: revoking someone else's session id is a no-op, not a 500.
      const revoked = await revokeSession(body.id, s.memberId);
      if (!revoked) return Response.json({ error: "not_found" }, { status: 404 });
      if (body.id === currentSid) {
        await dropCookie();
        loggedOut = true;
      }
    } else {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    return Response.json({ ok: true, loggedOut });
  } catch {
    return UNAUTHORIZED();
  }
}
