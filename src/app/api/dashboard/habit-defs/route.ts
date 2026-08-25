import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";

const BUILTIN = [
  { id: "water",     label: "Вода",      builtin: true, position: 0 },
  { id: "walk",      label: "Прогулка",  builtin: true, position: 1 },
  { id: "workout",   label: "Тренировка", builtin: true, position: 2 },
  { id: "breakfast", label: "Завтрак",   builtin: true, position: 3 },
  { id: "quran",     label: "Коран",     builtin: true, position: 4 },
];

const auth = requireOwner;

async function seedIfEmpty() {
  const rows = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM habit_defs");
  if (Number(rows[0]?.count ?? "0") === 0) {
    for (const h of BUILTIN) {
      await query(
        "INSERT INTO habit_defs (id, label, builtin, position) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
        [h.id, h.label, h.builtin, h.position]
      );
    }
  }
}

export async function GET() {
  try {
    await auth();
    await seedIfEmpty();
    const rows = await query(
      "SELECT id, label, builtin, position FROM habit_defs ORDER BY builtin DESC, position ASC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { id, label } = await req.json();
    const newId = id ?? `c_${Date.now()}`;
    const rows = await query(
      `INSERT INTO habit_defs (id, label, builtin, position)
       VALUES ($1, $2, FALSE, COALESCE((SELECT MAX(position)+1 FROM habit_defs), 0))
       RETURNING id, label, builtin, position`,
      [newId, label]
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("habit-defs:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, label, position } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE habit_defs SET
         label = COALESCE($2, label),
         position = COALESCE($3, position),
         updated_at = NOW()
       WHERE id = $1`,
      [id, label ?? null, position ?? null]
    );
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("habit-defs:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/**
 * DELETE — `{ id }` removes one habit, `{ reset: true }` restores the builtin
 * five.
 *
 * Builtins are deletable: they're the owner's own list and blocking the delete
 * just left a habit stuck on the page. What made deletion dangerous was that it
 * was one-way — `seedIfEmpty` only fires on a completely empty table — so the
 * reset below is the recovery path. The underlying `habits` columns are never
 * dropped, so restoring a builtin brings its history back with it.
 */
export async function DELETE(req: Request) {
  try {
    await auth();
    const body = await req.json();

    if (body?.reset === true) {
      for (const h of BUILTIN) {
        await query(
          `INSERT INTO habit_defs (id, label, builtin, position) VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET builtin = TRUE, position = EXCLUDED.position, updated_at = NOW()`,
          [h.id, h.label, h.builtin, h.position],
        );
      }
      const rows = await query(
        "SELECT id, label, builtin, position FROM habit_defs ORDER BY builtin DESC, position ASC",
      );
      return Response.json(rows);
    }

    const { id } = body ?? {};
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query("DELETE FROM habit_defs WHERE id = $1", [id]);
    // Custom habits also own rows in habit_custom_completions, which has no FK.
    await query("DELETE FROM habit_custom_completions WHERE habit_id = $1", [id]);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("habit-defs:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
