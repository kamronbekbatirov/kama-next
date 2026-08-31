import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { query } from "@/lib/db";
import { getWorkoutForDay } from "@/lib/sport";
import { getDay, dayTotal } from "@/lib/food";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface DaySummary {
  date: string;
  todos: { id: number; text: string }[];
  habits: string[];
  workout: { kind: string; sets: { name: string; set_no: number; reps: number | null;
                                  weight_kg: number | null; seconds: number | null }[] } | null;
  food: { entries: { name: string; kcal: number | null; kcal_max: number | null }[];
          total: { min: number; max: number } };
}

/**
 * What the day actually contained — assembled, not stored.
 *
 * This is the preview behind "close the day": the reflection fields are what he
 * writes, and this is what he did. It is gathered fresh here and only written
 * into the log when he confirms, so nothing is recorded that he has not seen.
 */
export async function GET(req: Request) {
  try {
    await requireOwner();
    const p = new URL(req.url).searchParams.get("date");
    const date = ISO.test(p ?? "") ? p! : await isoToday();

    const [todos, habitRow, customDone, workout, entries, total] = await Promise.all([
      query<{ id: number; text: string }>(
        `SELECT id, text FROM todos
          WHERE status = 'done' AND done_at::date = $1::date ORDER BY done_at`, [date]),
      query<Record<string, boolean>>("SELECT * FROM habits WHERE date = $1::date", [date]),
      query<{ label: string }>(
        `SELECT d.label FROM habit_custom_completions c
           JOIN habit_defs d ON d.id = c.habit_id
          WHERE c.date = $1::date AND c.done`, [date]),
      getWorkoutForDay(date),
      getDay(date),
      dayTotal(date),
    ]);

    const row = habitRow[0] ?? {};
    const builtin = ["fajr", "dhuhr", "asr", "maghrib", "isha",
                     "water", "walk", "workout", "breakfast", "quran"]
      .filter(k => row[k] === true);

    const summary: DaySummary = {
      date,
      todos,
      habits: [...builtin, ...customDone.map(c => c.label)],
      workout: workout ? { kind: workout.kind, sets: workout.sets.map(s => ({
        name: s.name, set_no: s.set_no, reps: s.reps, weight_kg: s.weight_kg, seconds: s.seconds,
      })) } : null,
      food: {
        entries: entries.map(e => ({ name: e.name, kcal: e.kcal, kcal_max: e.kcal_max })),
        total: { min: total.min, max: total.max },
      },
    };
    return Response.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("log/summary:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
