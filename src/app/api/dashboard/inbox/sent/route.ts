import { getSession } from "@/lib/auth";
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
  const s = await getSession();
  if (!s?.authenticated) return Response.json({ error: "unauthorized" }, { status: 401 });

  const inReplyTo = new URL(req.url).searchParams.get("in_reply_to");
  const where = inReplyTo ? "WHERE in_reply_to = $1" : "";
  const params = inReplyTo ? [Number(inReplyTo)] : [];

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
