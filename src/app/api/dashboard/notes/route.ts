import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isUnlocked } from "@/lib/note-lock";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

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
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, title, content, locked } = await req.json();
    // Fields are individually optional: an autosave sends title+content; a lock
    // toggle sends only `locked`. COALESCE keeps whatever isn't provided.
    const rows = await query(
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
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await auth();
    const { id } = await req.json();
    await query("DELETE FROM notes WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
