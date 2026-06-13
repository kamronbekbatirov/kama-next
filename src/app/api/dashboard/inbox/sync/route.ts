import { getSession } from "@/lib/auth";
import { syncReceivedEmails } from "@/lib/inbox-sync";

export const dynamic = "force-dynamic";

/**
 * Pull new received emails from Resend into the inbox.
 * Auth: a logged-in dashboard session, OR the shared X-Inbox-Key secret so a
 * background timer can keep the inbox current even when nobody's looking.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOX_INGEST_SECRET;
  const keyed = !!secret && req.headers.get("x-inbox-key") === secret;
  if (!keyed) {
    const s = await getSession();
    if (!s?.authenticated) return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncReceivedEmails();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("inbox sync:", e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "sync_failed" }, { status: 500 });
  }
}
