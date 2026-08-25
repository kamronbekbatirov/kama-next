import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { isoToday } from "@/lib/timezone";

const HABIT_COLUMNS = [
  "fajr", "dhuhr", "asr", "maghrib", "isha",
  "water", "walk", "workout", "breakfast", "quran",
] as const;
type HabitColumn = typeof HABIT_COLUMNS[number];

const auth = requireOwner;

export async function GET(req: Request) {
  try {
    await auth();
    const date = new URL(req.url).searchParams.get("date") ?? await isoToday();
    const rows = await query<Record<string, boolean | string>>(
      "SELECT * FROM habits WHERE date = $1", [date]);
    return Response.json(rows[0] ?? null);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

// Patch the day's habits row. Only the columns actually present in the payload
// are written — every other column keeps whatever is stored.
//
// This used to upsert all ten columns from the request body. The tab loads the
// row once on mount and never refetches, so if the bot marked a habit over
// Telegram in the meantime, the next checkbox tap shipped the stale `false` back
// and silently un-marked it. All columns are `NOT NULL DEFAULT FALSE`, so a
// partial INSERT is safe on a fresh day.
export async function POST(req: Request) {
  try {
    await auth();
    const body = await req.json();
    const date = typeof body?.date === "string" ? body.date : await isoToday();

    const touched = HABIT_COLUMNS.filter(c => c in (body ?? {})) as HabitColumn[];
    if (touched.length === 0) {
      const current = await query<Record<string, boolean | string>>(
        "SELECT * FROM habits WHERE date = $1", [date]);
      return Response.json(current[0] ?? null);
    }

    const cols = touched.join(", ");
    const placeholders = touched.map((_, i) => `$${i + 2}`).join(", ");
    const updates = touched.map(c => `${c} = EXCLUDED.${c}`).join(", ");

    const params: (string | boolean)[] = [date, ...touched.map(c => !!body[c])];

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
