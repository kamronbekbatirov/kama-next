import { getSession, ensureTrackedSession } from "@/lib/auth";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s?.authenticated) return Response.json({ ok: false }, { status: 401 });

  // Migrate a pre-session-tracking cookie so it shows up (and is revocable) in
  // the sessions list, without forcing a manual re-login.
  if (!s.sid) {
    await ensureTrackedSession({
      userAgent: req.headers.get("user-agent"),
      ip:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null,
    });
  }
  return Response.json({ ok: true });
}
