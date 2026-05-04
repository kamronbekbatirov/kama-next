import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET(req: Request) {
  try {
    await auth();
    const date = new URL(req.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const rows = await query("SELECT * FROM habits WHERE date = $1", [date]);
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { date, key, done, value } = await req.json();
    const rows = await query(
      `INSERT INTO habits (date, key, done, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (date, key) DO UPDATE SET done = $3, value = $4
       RETURNING *`,
      [date, key, done ?? false, value ?? null]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
