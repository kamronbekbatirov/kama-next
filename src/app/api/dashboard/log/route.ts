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
    const b = await req.json();
    const { date, visa_progress, what_worked, tomorrow_task, notes, summary } = b;
    const d = date ?? await isoToday();

    // The workout columns are no longer written from here — the Sport tab owns
    // that now — but they are still read for the history that predates it, so
    // COALESCE keeps the old numbers rather than zeroing them on every save.
    const rows = await query(
      `INSERT INTO daily_log (date, visa_progress, what_worked, tomorrow_task, notes, summary, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())
       ON CONFLICT (date) DO UPDATE SET
         visa_progress=$2, what_worked=$3, tomorrow_task=$4, notes=$5,
         summary = COALESCE($6::jsonb, daily_log.summary),
         updated_at=NOW()
       RETURNING *`,
      [d, visa_progress, what_worked, tomorrow_task, notes,
       summary === undefined || summary === null ? null : JSON.stringify(summary)]
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("log:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
