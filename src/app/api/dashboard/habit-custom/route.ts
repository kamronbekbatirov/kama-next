import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

// GET ?date=YYYY-MM-DD → { habit_id: bool, ... }
export async function GET(req: Request) {
  try {
    await auth();
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return Response.json({ error: "date required" }, { status: 400 });
    const rows = await query<{ habit_id: string; done: boolean }>(
      "SELECT habit_id, done FROM habit_custom_completions WHERE date = $1",
      [date]
    );
    const result: Record<string, boolean> = {};
    for (const r of rows) result[r.habit_id] = r.done;
    return Response.json(result);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

// POST { date, habit_id, done } → upsert
export async function POST(req: Request) {
  try {
    await auth();
    const { date, habit_id, done } = await req.json();
    if (!date || !habit_id) return Response.json({ error: "date and habit_id required" }, { status: 400 });
    await query(
      `INSERT INTO habit_custom_completions (date, habit_id, done)
       VALUES ($1, $2, $3)
       ON CONFLICT (date, habit_id) DO UPDATE SET done = EXCLUDED.done`,
      [date, habit_id, !!done]
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
