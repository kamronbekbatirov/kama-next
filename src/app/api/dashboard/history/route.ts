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

    // Single query: habits rows + whether a daily_log entry exists for each date
    const [habits, logs] = await Promise.all([
      query(
        `SELECT * FROM habits WHERE date >= CURRENT_DATE - $1 ORDER BY date ASC`,
        [days]
      ),
      query(
        `SELECT date FROM daily_log WHERE date >= CURRENT_DATE - $1 ORDER BY date ASC`,
        [days]
      ),
    ]);

    return Response.json({ habits, logs });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
