import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET() {
  try {
    await auth();
    const rows = await query(
      "SELECT * FROM todos ORDER BY done ASC, priority DESC, created_at DESC"
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { text, category, priority } = await req.json();
    const rows = await query(
      "INSERT INTO todos (text, category, priority) VALUES ($1, $2, $3) RETURNING *",
      [text, category ?? "general", priority ?? "medium"]
    );
    return Response.json(rows[0]);
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const body = await req.json();
    if (body.done !== undefined) {
      await query(
        "UPDATE todos SET done = $1, done_at = $2 WHERE id = $3",
        [body.done, body.done ? new Date() : null, body.id]
      );
    } else {
      await query(
        "UPDATE todos SET text = $1, category = $2, priority = $3 WHERE id = $4",
        [body.text, body.category, body.priority, body.id]
      );
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await auth();
    const { id } = await req.json();
    await query("DELETE FROM todos WHERE id = $1", [id]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
