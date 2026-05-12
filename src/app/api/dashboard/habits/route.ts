import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const HABIT_COLUMNS = [
  "fajr", "dhuhr", "asr", "maghrib", "isha",
  "water", "walk", "workout", "breakfast", "quran",
] as const;
type HabitColumn = typeof HABIT_COLUMNS[number];

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    await auth();
    const date = new URL(req.url).searchParams.get("date") ?? isoToday();
    const rows = await query<Record<string, boolean | string>>(
      "SELECT * FROM habits WHERE date = $1", [date]);
    return Response.json(rows[0] ?? null);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

// Bulk-set the day's habits row. The today-tab posts the whole object
// (`{ date, fajr, water, … }`) when any checkbox flips, so we upsert all
// columns at once.
export async function POST(req: Request) {
  try {
    await auth();
    const body = await req.json();
    const date = typeof body?.date === "string" ? body.date : isoToday();

    const values: Record<HabitColumn, boolean> = {} as Record<HabitColumn, boolean>;
    for (const col of HABIT_COLUMNS) {
      values[col] = !!body?.[col];
    }

    const cols = HABIT_COLUMNS.join(", ");
    const placeholders = HABIT_COLUMNS.map((_, i) => `$${i + 2}`).join(", ");
    const updates = HABIT_COLUMNS.map(c => `${c} = EXCLUDED.${c}`).join(", ");

    const params: (string | boolean)[] = [date, ...HABIT_COLUMNS.map(c => values[c])];

    const rows = await query<Record<string, boolean | string>>(
      `INSERT INTO habits (date, ${cols})
       VALUES ($1, ${placeholders})
       ON CONFLICT (date) DO UPDATE SET ${updates}, updated_at = NOW()
       RETURNING *`,
      params
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("habits POST:", msg);
    return Response.json({ error: "error", detail: msg }, { status: 500 });
  }
}
