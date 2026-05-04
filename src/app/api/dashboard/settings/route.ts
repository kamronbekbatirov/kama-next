import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET(req: Request) {
  try {
    await auth();
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key) {
      const rows = await query<{ value: unknown }>(
        "SELECT value FROM settings WHERE key = $1",
        [key]
      );
      return Response.json({ key, value: rows[0]?.value ?? null });
    }
    const rows = await query("SELECT key, value FROM settings");
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { key, value } = await req.json();
    if (!key) return Response.json({ error: "key required" }, { status: 400 });
    await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
