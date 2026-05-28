import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const VALID_STATUSES = ["todo", "doing", "done"] as const;
type Status = typeof VALID_STATUSES[number];
function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET() {
  try {
    await auth();
    const rows = await query(
      `SELECT id, text, description, category, priority, done, done_at, status, position, archived, created_at
       FROM todos
       ORDER BY status, position ASC, created_at DESC`
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { text, description, category, priority, status } = await req.json();
    const st: Status = isStatus(status) ? status : "todo";
    const desc = typeof description === "string" && description.trim() ? description : null;
    const rows = await query(
      `INSERT INTO todos (text, description, category, priority, status, position, done)
       VALUES ($1, $2, $3, $4, $5,
         COALESCE((SELECT MIN(position) - 1 FROM todos WHERE status = $5), 0),
         $5 = 'done')
       RETURNING id, text, description, category, priority, done, done_at, status, position, archived, created_at`,
      [text, desc, category ?? "general", priority ?? "medium", st]
    );
    return Response.json(rows[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("todos POST:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await auth();
    const body = await req.json();
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

    if (body.archived !== undefined) {
      await query(
        `UPDATE todos SET archived = $1 WHERE id = $2`,
        [!!body.archived, body.id]
      );
      return Response.json({ ok: true });
    }

    if (body.status !== undefined && isStatus(body.status)) {
      const pos = typeof body.position === "number" ? body.position : null;
      if (pos === null) {
        // Append to the column
        await query(
          `UPDATE todos SET
             status = $2,
             position = COALESCE((SELECT MAX(position) + 1 FROM todos WHERE status = $2), 0),
             done = ($2 = 'done'),
             done_at = CASE WHEN $2 = 'done' AND NOT done THEN NOW()
                            WHEN $2 <> 'done' THEN NULL
                            ELSE done_at END
           WHERE id = $1`,
          [body.id, body.status]
        );
      } else {
        await query(
          `UPDATE todos SET
             status = $2,
             position = $3,
             done = ($2 = 'done'),
             done_at = CASE WHEN $2 = 'done' AND NOT done THEN NOW()
                            WHEN $2 <> 'done' THEN NULL
                            ELSE done_at END
           WHERE id = $1`,
          [body.id, body.status, pos]
        );
      }
      return Response.json({ ok: true });
    }

    if (body.done !== undefined) {
      const nextStatus = body.done ? "done" : "todo";
      await query(
        `UPDATE todos SET
           done = $1,
           done_at = $2,
           status = $3,
           position = COALESCE((SELECT MAX(position) + 1 FROM todos WHERE status = $3), 0)
         WHERE id = $4`,
        [body.done, body.done ? new Date() : null, nextStatus, body.id]
      );
      return Response.json({ ok: true });
    }

    // `description` can be explicitly set to "" (empty) to clear it, so we use a
    // distinct sentinel: undefined -> no change, anything else (including "") -> set.
    const newDescription =
      "description" in body
        ? (typeof body.description === "string" && body.description.trim()
            ? body.description
            : null)
        : undefined;

    await query(
      `UPDATE todos SET
         text = COALESCE($1, text),
         description = CASE WHEN $5::boolean THEN $2 ELSE description END,
         category = COALESCE($3, category),
         priority = COALESCE($4, priority)
       WHERE id = $6`,
      [
        body.text ?? null,
        newDescription ?? null,
        body.category ?? null,
        body.priority ?? null,
        newDescription !== undefined,
        body.id,
      ]
    );
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("todos PATCH:", msg);
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
