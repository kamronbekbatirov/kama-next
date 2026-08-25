import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface SentMessage {
  id: number;
  in_reply_to: number | null;
  from_addr: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

/**
 * GET — sent messages, newest first.
 *   ?in_reply_to=N  → only replies to inbox message N (for per-message threads)
 */
export async function GET(req: Request) {
  try { await requireOwner(); } catch { return UNAUTHORIZED(); }
  // A non-numeric `?in_reply_to=` used to reach Postgres as the literal "NaN"
  // and 500 on a bigint cast.
  const raw = new URL(req.url).searchParams.get("in_reply_to");
  const parsed = raw === null ? null : Number(raw);
  const inReplyTo = parsed !== null && Number.isInteger(parsed) ? parsed : null;
  const where = inReplyTo !== null ? "WHERE in_reply_to = $1" : "";
  const params = inReplyTo !== null ? [inReplyTo] : [];

  try {
    const messages = await query<SentMessage>(
      `SELECT id, in_reply_to, from_addr, to_email, to_name, subject, body, status, error, created_at
       FROM sent_messages ${where} ORDER BY created_at DESC LIMIT 300`,
      params,
    );
    return Response.json({ messages });
  } catch (e) {
    console.error("inbox sent GET:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/** DELETE — { id }. Remove a sent record (does not unsend the email). */
export async function DELETE(req: Request) {
  try { await requireOwner(); } catch { return UNAUTHORIZED(); }
  try {
    const { id } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(`DELETE FROM sent_messages WHERE id = $1`, [id]);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("inbox sent DELETE:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "error" }, { status: 500 });
  }
}
