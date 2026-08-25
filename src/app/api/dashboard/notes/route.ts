import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { isUnlocked } from "@/lib/note-lock";

const auth = requireOwner;

interface NoteRow {
  id: number;
  title: string;
  content: string;
  updated_at: string;
  locked: boolean;
}

export async function GET() {
  try {
    await auth();
    const rows = await query<NoteRow>(
      "SELECT id, title, content, updated_at, locked FROM notes ORDER BY updated_at DESC",
    );
    // Locked notes never send their body unless the PIN has been verified.
    const unlocked = await isUnlocked();
    const safe = rows.map(n => (n.locked && !unlocked ? { ...n, content: "" } : n));
    return Response.json(safe);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { title, content } = await req.json();
    const rows = await query(
      "INSERT INTO notes (title, content) VALUES ($1, $2) RETURNING *",
      [title ?? "", content ?? ""]
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("notes:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/** A locked note may only be written, read back, or deleted once the PIN has
 *  been verified for this session. GET already redacts; these did not, so
 *  `PATCH {id}` returned the whole body via `RETURNING *` with no PIN at all. */
async function assertUnlocked(id: unknown): Promise<void> {
  const rows = await query<{ locked: boolean }>(
    "SELECT locked FROM notes WHERE id = $1", [id],
  );
  if (rows[0]?.locked && !(await isUnlocked())) throw new Error("locked");
}

function fail(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
  if (msg === "locked") return Response.json({ error: "locked" }, { status: 403 });
  console.error("notes route:", msg);
  return Response.json({ error: "error" }, { status: 500 });
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, title, content, locked } = await req.json();
    await assertUnlocked(id);
    // Fields are individually optional: an autosave sends title+content; a lock
    // toggle sends only `locked`. COALESCE keeps whatever isn't provided.
    const rows = await query<NoteRow>(
      `UPDATE notes SET
         title = COALESCE($1, title),
         content = COALESCE($2, content),
         locked = COALESCE($3, locked),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [
        title ?? null,
        content ?? null,
        typeof locked === "boolean" ? locked : null,
        id,
      ]
    );
    const row = rows[0];
    // Locking a note in this same call must not echo the body back either.
    return Response.json(row?.locked && !(await isUnlocked()) ? { ...row, content: "" } : row);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await auth();
    const { id } = await req.json();
    await assertUnlocked(id);
    await query("DELETE FROM notes WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
