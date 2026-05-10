import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET(req: Request) {
  try {
    await auth();
    const days = parseInt(new URL(req.url).searchParams.get("days") ?? "14");

    const [habits, logs, defs, customCompletions] = await Promise.all([
      query(
        `SELECT * FROM habits WHERE date >= CURRENT_DATE - $1::int ORDER BY date ASC`,
        [days]
      ),
      query(
        `SELECT date::text AS date FROM daily_log WHERE date >= CURRENT_DATE - $1::int ORDER BY date ASC`,
        [days]
      ),
      query(
        `SELECT id, label, builtin, position FROM habit_defs ORDER BY builtin DESC, position ASC`
      ),
      query(
        `SELECT date::text AS date, habit_id, done FROM habit_custom_completions
         WHERE date >= CURRENT_DATE - $1::int`,
        [days]
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
