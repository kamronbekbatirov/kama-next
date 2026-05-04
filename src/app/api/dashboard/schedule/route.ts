import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const DEFAULT_SCHEDULE = [
  { id: "s_fajr",      start_min: 420,  end_min: 450,  label: "Фаджр + Коран",      icon: "🕌", position: 0 },
  { id: "s_walk",      start_min: 450,  end_min: 480,  label: "Утренняя прогулка",   icon: "🚶", position: 1 },
  { id: "s_workout",   start_min: 480,  end_min: 510,  label: "Домашняя тренировка", icon: "💪", position: 2 },
  { id: "s_breakfast", start_min: 510,  end_min: 540,  label: "Завтрак",             icon: "🍳", position: 3 },
  { id: "s_work",      start_min: 540,  end_min: 780,  label: "Основная работа",     icon: "💻", position: 4 },
  { id: "s_lunch",     start_min: 780,  end_min: 840,  label: "Обед + Зухр",         icon: "🍽️", position: 5 },
  { id: "s_comms",     start_min: 840,  end_min: 900,  label: "Коммуникации",        icon: "💬", position: 6 },
  { id: "s_skills",    start_min: 900,  end_min: 960,  label: "Навыки",              icon: "📚", position: 7 },
  { id: "s_freelance", start_min: 960,  end_min: 1080, label: "Фриланс",             icon: "💼", position: 8 },
  { id: "s_evening",   start_min: 1080, end_min: 1200, label: "Вечерняя рутина",     icon: "🌙", position: 9 },
  { id: "s_isha",      start_min: 1200, end_min: 1320, label: "Рефлексия + Иша",     icon: "🤲", position: 10 },
];

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

async function seedIfEmpty() {
  const rows = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM schedule_blocks");
  if (Number(rows[0]?.count ?? "0") === 0) {
    for (const b of DEFAULT_SCHEDULE) {
      await query(
        "INSERT INTO schedule_blocks (id, start_min, end_min, label, icon, position) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING",
        [b.id, b.start_min, b.end_min, b.label, b.icon, b.position]
      );
    }
  }
}

export async function GET() {
  try {
    await auth();
    await seedIfEmpty();
    const rows = await query(
      "SELECT id, start_min, end_min, label, icon, position FROM schedule_blocks ORDER BY position ASC, start_min ASC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { id, start_min, end_min, label, icon } = await req.json();
    const rows = await query(
      `INSERT INTO schedule_blocks (id, start_min, end_min, label, icon, position)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(position)+1 FROM schedule_blocks), 0))
       ON CONFLICT (id) DO UPDATE SET start_min = EXCLUDED.start_min, end_min = EXCLUDED.end_min,
         label = EXCLUDED.label, icon = EXCLUDED.icon, updated_at = NOW()
       RETURNING id, start_min, end_min, label, icon, position`,
      [id, start_min, end_min, label, icon]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const { id, start_min, end_min, label, icon, position } = await req.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await query(
      `UPDATE schedule_blocks SET
         start_min = COALESCE($2, start_min),
         end_min = COALESCE($3, end_min),
         label = COALESCE($4, label),
         icon = COALESCE($5, icon),
         position = COALESCE($6, position),
         updated_at = NOW()
       WHERE id = $1`,
      [id, start_min ?? null, end_min ?? null, label ?? null, icon ?? null, position ?? null]
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await auth();
    const body = await req.json();
    if (body.reset === true) {
      await query("DELETE FROM schedule_blocks");
      for (const b of DEFAULT_SCHEDULE) {
        await query(
          "INSERT INTO schedule_blocks (id, start_min, end_min, label, icon, position) VALUES ($1,$2,$3,$4,$5,$6)",
          [b.id, b.start_min, b.end_min, b.label, b.icon, b.position]
        );
      }
      return Response.json({ ok: true, reset: true });
    }
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    await query("DELETE FROM schedule_blocks WHERE id = $1", [body.id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
