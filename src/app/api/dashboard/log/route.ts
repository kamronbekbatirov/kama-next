import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { isoToday } from "@/lib/timezone";

const auth = requireOwner;

export async function GET(req: Request) {
  try {
    await auth();
    const date = new URL(req.url).searchParams.get("date") ?? await isoToday();
    const rows = await query("SELECT * FROM daily_log WHERE date = $1", [date]);
    return Response.json(rows[0] ?? null);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { date, visa_progress, what_worked, tomorrow_task, workout_pushups, workout_plank, workout_walk, notes } = await req.json();
    const d = date ?? await isoToday();
    const rows = await query(
      `INSERT INTO daily_log (date, visa_progress, what_worked, tomorrow_task, workout_pushups, workout_plank, workout_walk, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (date) DO UPDATE SET
         visa_progress=$2, what_worked=$3, tomorrow_task=$4,
         workout_pushups=$5, workout_plank=$6, workout_walk=$7,
         notes=$8, updated_at=NOW()
       RETURNING *`,
      [d, visa_progress, what_worked, tomorrow_task, workout_pushups ?? 0, workout_plank ?? 0, workout_walk ?? 0, notes]
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("log:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
