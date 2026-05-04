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
      "SELECT * FROM budget_entries ORDER BY date DESC, created_at DESC LIMIT 30"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { type, amount, category, description, date } = await req.json();
    const rows = await query(
      "INSERT INTO budget_entries (type, amount, category, description, date) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [type, amount, category ?? null, description ?? null, date ?? new Date().toISOString().slice(0, 10)]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, type, amount, description, category, date } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE budget_entries SET
         type = COALESCE($2, type),
         amount = COALESCE($3, amount),
         description = COALESCE($4, description),
         category = COALESCE($5, category),
         date = COALESCE($6, date)
       WHERE id = $1`,
      [id, type ?? null, amount ?? null, description ?? null, category ?? null, date ?? null]
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
    await query("DELETE FROM budget_entries WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
