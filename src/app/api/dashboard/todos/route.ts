import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";

const VALID_STATUSES = ["todo", "doing", "done"] as const;
type Status = typeof VALID_STATUSES[number];
function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

const auth = requireOwner;

// Accepts an ISO 8601 string (or "" / null to clear). Returns a Date for the
// instant, or null. The UI sends a UTC ISO string built from the user's local
// wall-clock pick; Claude sends ISO 8601 with an explicit offset.
function parseDue(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    await auth();
    // The linked goal's momentum travels with the task, so a card can show
    // "this is moving" without the board fetching every goal separately.
    const rows = await query(
      `SELECT t.id, t.text, t.description, t.category, t.priority, t.done, t.done_at,
              t.status, t.position, t.archived, t.created_at, t.due_at,
              t.tracker_goal_id,
              g.title        AS goal_title,
              g.metric_unit  AS goal_unit,
              g.target_value::float AS goal_target,
              g.period       AS goal_period,
              COALESCE((SELECT COUNT(*) FROM tracker_checkins c
                         WHERE c.goal_id = g.id AND c.value > 0
                           AND c.day > CURRENT_DATE - 7), 0)::int  AS goal_done_7,
              COALESCE((SELECT COUNT(*) FROM tracker_checkins c
                         WHERE c.goal_id = g.id AND c.value > 0
                           AND c.day > CURRENT_DATE - 30), 0)::int AS goal_done_30
         FROM todos t
         LEFT JOIN tracker_goals g
                ON g.id = t.tracker_goal_id AND g.status = 'active'
        ORDER BY t.status, t.position ASC, t.created_at DESC`
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { text, description, category, priority, status, due_at } = await req.json();
    const st: Status = isStatus(status) ? status : "todo";
    const desc = typeof description === "string" && description.trim() ? description : null;
    const due = parseDue(due_at);
    const rows = await query(
      `INSERT INTO todos (text, description, category, priority, status, position, done, due_at)
       VALUES ($1, $2, $3, $4, $5,
         COALESCE((SELECT MIN(position) - 1 FROM todos WHERE status = $5), 0),
         $5 = 'done', $6)
       RETURNING id, text, description, category, priority, done, done_at, status, position, archived, created_at, due_at`,
      [text, desc, category ?? "general", priority ?? "medium", st, due]
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

    // Own branch: unlinking means writing NULL, which COALESCE cannot express.
    // The goal must be the owner's own and still active — a task cannot point
    // at a guest's goal, and there is no id here that could reach one.
    if ("tracker_goal_id" in body) {
      // Explicit null check first: Number(null) is 0 and Number.isInteger(0) is
      // true, so an unlink would otherwise be read as "link to goal #0" and
      // rejected as someone else's goal.
      const raw = body.tracker_goal_id;
      const goalId = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
      if (!Number.isInteger(goalId) || goalId <= 0) {
        await query("UPDATE todos SET tracker_goal_id = NULL WHERE id = $1", [body.id]);
        return Response.json({ ok: true, tracker_goal_id: null });
      }
      const owned = await query<{ id: number }>(
        `SELECT g.id FROM tracker_goals g
           JOIN members m ON m.id = g.member_id AND m.role = 'owner'
          WHERE g.id = $1 AND g.status = 'active'`,
        [goalId],
      );
      if (owned.length === 0) {
        return Response.json({ error: "no such goal of yours" }, { status: 400 });
      }
      await query("UPDATE todos SET tracker_goal_id = $2 WHERE id = $1", [body.id, goalId]);
      return Response.json({ ok: true, tracker_goal_id: goalId });
    }

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

    // Same sentinel idea for due_at: present in body -> set (a falsy value clears
    // it); absent -> leave unchanged.
    const dueProvided = "due_at" in body;
    const newDue = dueProvided ? parseDue(body.due_at) : null;

    await query(
      `UPDATE todos SET
         text = COALESCE($1, text),
         description = CASE WHEN $5::boolean THEN $2 ELSE description END,
         category = COALESCE($3, category),
         priority = COALESCE($4, priority),
         due_at = CASE WHEN $7::boolean THEN $8 ELSE due_at END
       WHERE id = $6`,
      [
        body.text ?? null,
        newDescription ?? null,
        body.category ?? null,
        body.priority ?? null,
        newDescription !== undefined,
        body.id,
        dueProvided,
        newDue,
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("todos:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
