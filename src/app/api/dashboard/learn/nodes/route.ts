import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET(req: Request) {
  try {
    await auth();
    const url = new URL(req.url);
    const subjectId = url.searchParams.get("subject_id");
    if (subjectId) {
      const rows = await query(
        "SELECT * FROM learn_nodes WHERE subject_id = $1 ORDER BY parent_id NULLS FIRST, position ASC, created_at ASC",
        [subjectId]
      );
      return Response.json(rows);
    }
    const rows = await query(
      "SELECT * FROM learn_nodes ORDER BY subject_id, parent_id NULLS FIRST, position ASC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { subject_id, parent_id, title, description, resources } = await req.json();
    if (!subject_id || !title?.trim()) {
      return Response.json({ error: "subject_id and title required" }, { status: 400 });
    }
    const rows = await query(
      `INSERT INTO learn_nodes (subject_id, parent_id, title, description, resources, position)
       VALUES ($1, $2, $3, $4, $5,
         COALESCE((SELECT MAX(position) + 1 FROM learn_nodes WHERE subject_id = $1 AND parent_id IS NOT DISTINCT FROM $2), 0))
       RETURNING *`,
      [subject_id, parent_id ?? null, title.trim(), description ?? null, JSON.stringify(resources ?? [])]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const body = await req.json();
    const { id, title, description, status, mastery_percent, position, parent_id, resources } = body;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE learn_nodes SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         mastery_percent = COALESCE($5, mastery_percent),
         position = COALESCE($6, position),
         parent_id = COALESCE($7, parent_id),
         resources = COALESCE($8, resources),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        title ?? null,
        description ?? null,
        status ?? null,
        mastery_percent ?? null,
        position ?? null,
        parent_id ?? null,
        resources !== undefined ? JSON.stringify(resources) : null,
      ]
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
    await query("DELETE FROM learn_nodes WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
