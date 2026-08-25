import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { isoToday } from "@/lib/timezone";

const auth = requireOwner;

// The list stays capped at 30 rows, but the balance must not be derived from
// it: summing a truncated list silently drops entry 31 and older, so the hero
// number drifted further from reality with every entry added. Totals are
// aggregated over the whole table here, and `spend30` is the real trailing-month
// outflow that the "/mo" figure claims to be.
export async function GET() {
  try {
    await auth();
    const [rows, totals] = await Promise.all([
      query(
        `SELECT id, type, amount::float AS amount, category, description, date::text AS date
         FROM budget_entries ORDER BY date DESC, created_at DESC LIMIT 30`
      ),
      query<{ income: number; expense: number; spend30: number }>(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0)::float  AS income,
           COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::float AS expense,
           COALESCE(SUM(amount) FILTER (
             WHERE type = 'expense' AND date >= CURRENT_DATE - 30
           ), 0)::float AS spend30
         FROM budget_entries`
      ),
    ]);
    return Response.json({
      entries: rows,
      totals: totals[0] ?? { income: 0, expense: 0, spend30: 0 },
    });
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
      [type, amount, category ?? null, description ?? null, date ?? await isoToday()]
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("budget:", msg);
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("budget:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await auth();
    const { id } = await req.json();
    await query("DELETE FROM budget_entries WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("budget:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
