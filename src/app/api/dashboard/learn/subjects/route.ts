import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET() {
  try {
    await auth();
    const rows = await query(
      "SELECT * FROM learn_subjects ORDER BY position ASC, created_at ASC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { title, emoji, description } = await req.json();
    if (!title?.trim()) return Response.json({ error: "title required" }, { status: 400 });
    const rows = await query(
      `INSERT INTO learn_subjects (title, emoji, description, position)
       VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM learn_subjects), 0))
       RETURNING *`,
      [title.trim(), emoji ?? null, description ?? null]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, title, emoji, description, position } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE learn_subjects SET
         title = COALESCE($2, title),
         emoji = COALESCE($3, emoji),
         description = COALESCE($4, description),
         position = COALESCE($5, position),
         updated_at = NOW()
       WHERE id = $1`,
      [id, title ?? null, emoji ?? null, description ?? null, position ?? null]
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await auth();
    const { id } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query("DELETE FROM learn_subjects WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
