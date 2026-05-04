import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

const ALLOWED = ["woop", "two_minute", "if_then", "goal", "commitment", "intrinsic"] as const;

export async function GET(req: Request) {
  try {
    await auth();
    const url = new URL(req.url);
    const method = url.searchParams.get("method");
    if (method && (ALLOWED as readonly string[]).includes(method)) {
      const rows = await query(
        "SELECT * FROM learn_methods WHERE method = $1 AND active = TRUE ORDER BY created_at DESC",
        [method]
      );
      return Response.json(rows);
    }
    const rows = await query(
      "SELECT * FROM learn_methods WHERE active = TRUE ORDER BY method, created_at DESC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { method, title, data, subject_id, node_id } = await req.json();
    if (!method || !(ALLOWED as readonly string[]).includes(method)) {
      return Response.json({ error: "invalid method" }, { status: 400 });
    }
    const rows = await query(
      `INSERT INTO learn_methods (method, title, data, subject_id, node_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [method, title ?? null, JSON.stringify(data ?? {}), subject_id ?? null, node_id ?? null]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, title, data, subject_id, node_id, active } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE learn_methods SET
         title = COALESCE($2, title),
         data = COALESCE($3, data),
         subject_id = COALESCE($4, subject_id),
         node_id = COALESCE($5, node_id),
         active = COALESCE($6, active),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        title ?? null,
        data !== undefined ? JSON.stringify(data) : null,
        subject_id ?? null,
        node_id ?? null,
        active ?? null,
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
    await query("DELETE FROM learn_methods WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
