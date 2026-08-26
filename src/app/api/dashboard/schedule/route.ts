import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";

// icon = lucide key, see @/lib/schedule-icons
const DEFAULT_SCHEDULE = [
  { id: "s_fajr",      start_min: 420,  end_min: 450,  label: "Фаджр + Коран",      icon: "night",     position: 0 },
  { id: "s_walk",      start_min: 450,  end_min: 480,  label: "Утренняя прогулка",   icon: "walk",      position: 1 },
  { id: "s_workout",   start_min: 480,  end_min: 510,  label: "Домашняя тренировка", icon: "dumbbell",  position: 2 },
  { id: "s_breakfast", start_min: 510,  end_min: 540,  label: "Завтрак",             icon: "breakfast", position: 3 },
  { id: "s_work",      start_min: 540,  end_min: 780,  label: "Основная работа",     icon: "laptop",    position: 4 },
  { id: "s_lunch",     start_min: 780,  end_min: 840,  label: "Обед + Зухр",         icon: "meal",      position: 5 },
  { id: "s_comms",     start_min: 840,  end_min: 900,  label: "Коммуникации",        icon: "chat",      position: 6 },
  { id: "s_skills",    start_min: 900,  end_min: 960,  label: "Навыки",              icon: "book",      position: 7 },
  { id: "s_freelance", start_min: 960,  end_min: 1080, label: "Фриланс",             icon: "briefcase", position: 8 },
  { id: "s_evening",   start_min: 1080, end_min: 1200, label: "Вечерняя рутина",     icon: "moon",      position: 9 },
  { id: "s_isha",      start_min: 1200, end_min: 1320, label: "Рефлексия + Иша",     icon: "pray",      position: 10 },
];

const auth = requireOwner;

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

const ALLOWED_ANCHORS = new Set(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);

export async function GET() {
  try {
    await auth();
    await seedIfEmpty();
    const rows = await query(
      "SELECT id, start_min, end_min, label, icon, position, anchor, offset_min FROM schedule_blocks ORDER BY position ASC, start_min ASC"
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("schedule:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const b = await req.json();
    const { id, start_min, end_min, label, icon, position } = b;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    // The anchor is set on its own branch: clearing it means writing NULL, and
    // COALESCE cannot express that. Sending `anchor: null` detaches a block
    // from its prayer and returns it to the clock.
    if ("anchor" in b) {
      const anchor = ALLOWED_ANCHORS.has(String(b.anchor)) ? String(b.anchor) : null;
      const off = Number.isInteger(b.offset_min) ? b.offset_min : 0;
      await query("UPDATE schedule_blocks SET anchor = $2, offset_min = $3, updated_at = NOW() WHERE id = $1",
        [id, anchor, anchor ? off : null]);
      return Response.json({ ok: true });
    }

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("schedule:", msg);
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("schedule:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
