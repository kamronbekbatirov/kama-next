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
      "SELECT id, name, amount::float AS amount, currency, day, active FROM subscriptions ORDER BY created_at DESC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { id, name, amount, currency, day } = await req.json();
    const subId = id ?? `s_${Date.now()}`;
    const rows = await query(
      `INSERT INTO subscriptions (id, name, amount, currency, day, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, name, amount::float AS amount, currency, day, active`,
      [subId, name, amount, currency ?? "$", Math.max(1, Math.min(31, parseInt(day) || 1))]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, name, amount, currency, day, active } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE subscriptions SET
         name = COALESCE($2, name),
         amount = COALESCE($3, amount),
         currency = COALESCE($4, currency),
         day = COALESCE($5, day),
         active = COALESCE($6, active)
       WHERE id = $1`,
      [id, name ?? null, amount ?? null, currency ?? null, day ?? null, active ?? null]
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
    await query("DELETE FROM subscriptions WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
