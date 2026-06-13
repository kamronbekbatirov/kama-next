import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { sendAndStore, mailSenders } from "@/lib/mail";

export const dynamic = "force-dynamic";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

/** GET — the verified from-addresses the composer can choose from. */
export async function GET() {
  try {
    await auth();
    return Response.json({ senders: mailSenders() });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

/**
 * POST — send a reply or a new email.
 * Body: { to, from?, toName?, subject, body, in_reply_to? }
 * On a reply, the referenced inbox message is marked read.
 */
export async function POST(req: Request) {
  try {
    await auth();
    const b = await req.json();
    const inReplyTo = typeof b.in_reply_to === "number" ? b.in_reply_to : null;

    const res = await sendAndStore({
      from: typeof b.from === "string" ? b.from : undefined,
      to: String(b.to ?? ""),
      toName: typeof b.toName === "string" ? b.toName : null,
      subject: String(b.subject ?? ""),
      body: String(b.body ?? ""),
      inReplyTo,
    });

    if (res.ok && inReplyTo != null) {
      await query(
        `UPDATE inbox_messages SET status='read', read_at=COALESCE(read_at, now())
         WHERE id=$1 AND status='new'`,
        [inReplyTo],
      ).catch(() => {});
    }

    if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
    return Response.json({ ok: true, id: res.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("inbox reply POST:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
