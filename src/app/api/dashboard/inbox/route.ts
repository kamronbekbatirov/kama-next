import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { InboxMessage } from "@/lib/inbox";
import { deleteStoredFile } from "@/lib/uploads";

export const dynamic = "force-dynamic";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

const COLS = `id, source, kind, category, name, email, subject, message, html, meta,
              ip, user_agent, status, created_at, read_at`;

export interface Attachment {
  id: number;
  filename: string;
  mime: string;
  size_bytes: number;
}

/**
 * GET — list messages.
 *   ?status=new|read|archived  → that bucket only
 *   ?status=inbox (default)    → new + read (everything not archived)
 * Always returns counts for the tab badges.
 */
export async function GET(req: Request) {
  try {
    await auth();
    const status = new URL(req.url).searchParams.get("status") ?? "inbox";

    let where = "status <> 'archived'";
    const params: string[] = [];
    if (status === "new" || status === "read" || status === "archived") {
      where = "status = $1";
      params.push(status);
    }

    const messages = await query<InboxMessage & { attachments?: Attachment[] }>(
      `SELECT ${COLS} FROM inbox_messages WHERE ${where} ORDER BY created_at DESC LIMIT 500`,
      params,
    );

    // Attach uploaded files in one round-trip. `storage_key` deliberately stays
    // server-side — the client addresses a file by its row id only.
    const ids = messages.map((m) => m.id);
    if (ids.length) {
      const files = await query<Attachment & { message_id: number }>(
        `SELECT id, message_id, filename, mime, size_bytes::bigint AS size_bytes
           FROM inbox_attachments WHERE message_id = ANY($1::bigint[]) ORDER BY id`,
        [ids],
      );
      const byMessage = new Map<number, Attachment[]>();
      for (const f of files) {
        const { message_id, ...file } = f;
        const list = byMessage.get(Number(message_id)) ?? [];
        list.push({ ...file, size_bytes: Number(file.size_bytes) });
        byMessage.set(Number(message_id), list);
      }
      for (const m of messages) m.attachments = byMessage.get(Number(m.id)) ?? [];
    }

    const countRows = await query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n FROM inbox_messages GROUP BY status`,
    );
    const counts = { new: 0, read: 0, archived: 0 };
    for (const r of countRows) {
      if (r.status in counts) counts[r.status as keyof typeof counts] = Number(r.n);
    }

    return Response.json({ messages, counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("inbox GET:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

const ACTIONS = ["read", "unread", "archive", "unarchive"] as const;
type Action = (typeof ACTIONS)[number];

/** PATCH — { id, action }. Reading a message stamps read_at. */
export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, action } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    if (!ACTIONS.includes(action as Action)) {
      return Response.json({ error: "bad action" }, { status: 400 });
    }

    const sql: Record<Action, string> = {
      read:      `UPDATE inbox_messages SET status='read', read_at=COALESCE(read_at, now()) WHERE id=$1`,
      unread:    `UPDATE inbox_messages SET status='new', read_at=NULL WHERE id=$1`,
      archive:   `UPDATE inbox_messages SET status='archived', read_at=COALESCE(read_at, now()) WHERE id=$1`,
      unarchive: `UPDATE inbox_messages SET status='read', read_at=COALESCE(read_at, now()) WHERE id=$1`,
    };
    await query(sql[action as Action], [id]);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("inbox PATCH:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/** DELETE — { id }. Hard delete. */
export async function DELETE(req: Request) {
  try {
    await auth();
    const { id } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    // Take the storage keys before the cascade drops the rows, so deleting a
    // message also reclaims its bytes instead of orphaning them on disk.
    const files = await query<{ storage_key: string }>(
      `SELECT storage_key FROM inbox_attachments WHERE message_id = $1`,
      [id],
    );
    await query(`DELETE FROM inbox_messages WHERE id=$1`, [id]);
    for (const f of files) await deleteStoredFile(f.storage_key);

    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("inbox DELETE:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
