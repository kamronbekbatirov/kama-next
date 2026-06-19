import {
  getSession,
  getCurrentSid,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  dropCookie,
} from "@/lib/auth";

async function requireAuth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET() {
  try {
    await requireAuth();
    return Response.json(await listSessions());
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAuth();
    const body = await req.json().catch(() => ({}));
    const currentSid = await getCurrentSid();
    let loggedOut = false;

    if (body.scope === "all") {
      await revokeAllSessions();
      await dropCookie(); // this device is included
      loggedOut = true;
    } else if (body.scope === "others") {
      await revokeOtherSessions();
    } else if (typeof body.id === "string" && body.id) {
      await revokeSession(body.id);
      if (body.id === currentSid) {
        await dropCookie();
        loggedOut = true;
      }
    } else {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    return Response.json({ ok: true, loggedOut });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
