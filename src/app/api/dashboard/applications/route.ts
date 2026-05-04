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
      "SELECT * FROM applications ORDER BY created_at DESC LIMIT 50"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { company, role, status, notes } = await req.json();
    const rows = await query(
      "INSERT INTO applications (company, role, status, notes) VALUES ($1, $2, $3, $4) RETURNING *",
      [company, role, status ?? "applied", notes ?? null]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, company, role, status, notes } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE applications SET
         company = COALESCE($2, company),
         role = COALESCE($3, role),
         status = COALESCE($4, status),
         notes = COALESCE($5, notes)
       WHERE id = $1`,
      [id, company ?? null, role ?? null, status ?? null, notes ?? null]
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
    await query("DELETE FROM applications WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
