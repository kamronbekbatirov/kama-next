import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { isoToday } from "@/lib/timezone";

const auth = requireOwner;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    await auth();
    const params = new URL(req.url).searchParams;
    // `?days=abc` used to reach Postgres as the literal "NaN" and 500.
    const parsed = parseInt(params.get("days") ?? "14", 10);
    const days = Number.isFinite(parsed) ? Math.min(366, Math.max(1, parsed)) : 14;
    // The window ends on the *client's* today — the server clock is UTC and can
    // be a calendar day behind the grid the dashboard is drawing.
    const endParam = params.get("end");
    const end = endParam && ISO_DATE.test(endParam) ? endParam : await isoToday();

    const [habits, logs, defs, customCompletions] = await Promise.all([
      query(
        `SELECT * FROM habits WHERE date > $2::date - $1::int AND date <= $2::date ORDER BY date ASC`,
        [days, end]
      ),
      // Only days with something actually written count as "logged". An empty
      // row survives clearing the form (the upsert keeps it), so selecting on
      // existence alone kept ticking the log dot for a day whose content had
      // been deleted.
      query(
        `SELECT date::text AS date FROM daily_log
         WHERE date > $2::date - $1::int AND date <= $2::date
           AND (
             COALESCE(TRIM(what_worked), '')   <> '' OR
             COALESCE(TRIM(tomorrow_task), '') <> '' OR
             COALESCE(TRIM(notes), '')         <> '' OR
             COALESCE(TRIM(visa_progress), '') <> '' OR
             COALESCE(workout_pushups, 0) > 0 OR
             COALESCE(workout_plank, 0)   > 0 OR
             COALESCE(workout_walk, 0)    > 0
           )
         ORDER BY date ASC`,
        [days, end]
      ),
      query(
        `SELECT id, label, builtin, position FROM habit_defs ORDER BY builtin DESC, position ASC`
      ),
      query(
        `SELECT date::text AS date, habit_id, done FROM habit_custom_completions
         WHERE date > $2::date - $1::int AND date <= $2::date`,
        [days, end]
      ),
    ]);

    return Response.json({ habits, logs, defs, customCompletions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("history route error:", msg);
    return Response.json({ error: "server", detail: msg }, { status: 500 });
  }
}
