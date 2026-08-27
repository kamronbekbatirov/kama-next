import { query } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import {
  computeNextReview,
  masteryFromState,
  statusFromHistory,
  replaySessions,
  type RecallScore,
} from "@/lib/learn/spaced-repetition";

const auth = requireOwner;

export async function GET(req: Request) {
  try {
    await auth();
    const url = new URL(req.url);
    const nodeId = url.searchParams.get("node_id");
    if (!nodeId) return Response.json({ error: "node_id required" }, { status: 400 });
    const rows = await query(
      "SELECT * FROM learn_sessions WHERE node_id = $1 ORDER BY created_at DESC LIMIT 100",
      [nodeId]
    );
    return Response.json(rows);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const { node_id, recall_score, notes, duration_minutes } = await req.json();
    if (!node_id || !recall_score) {
      return Response.json({ error: "node_id and recall_score required" }, { status: 400 });
    }
    const score = Math.max(1, Math.min(5, Number(recall_score))) as RecallScore;

    const nodes = await query<{
      ease_factor: number;
      interval_days: number;
      status: string;
    }>(
      "SELECT ease_factor, interval_days, status FROM learn_nodes WHERE id = $1",
      [node_id]
    );
    if (nodes.length === 0) {
      return Response.json({ error: "node not found" }, { status: 404 });
    }
    const node = nodes[0];

    const next = computeNextReview(
      { ease_factor: node.ease_factor, interval_days: node.interval_days },
      score
    );
    const newStatus = statusFromHistory(score, node.status);
    const newMastery = masteryFromState(next.ease_factor, next.interval_days);

    const sessions = await query(
      `INSERT INTO learn_sessions (node_id, recall_score, notes, duration_minutes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [node_id, score, notes ?? null, duration_minutes ?? null]
    );

    await query(
      `UPDATE learn_nodes SET
         ease_factor = $2,
         interval_days = $3,
         next_review = $4,
         status = $5,
         mastery_percent = $6,
         updated_at = NOW()
       WHERE id = $1`,
      [node_id, next.ease_factor, next.interval_days, next.next_review, newStatus, newMastery]
    );

    return Response.json({
      session: sessions[0],
      node_update: {
        ease_factor: next.ease_factor,
        interval_days: next.interval_days,
        next_review: next.next_review,
        status: newStatus,
        mastery_percent: newMastery,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("learn/sessions:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/**
 * Undo a recall.
 *
 * Grading a node moved its ease, interval, next review, status and mastery all
 * at once, and none of it could be taken back — one mis-tap and the node was
 * scheduled on numbers you never meant. Deleting the session and replaying the
 * ones that remain restores exactly the state the node was in before.
 */
export async function DELETE(req: Request) {
  try {
    await auth();
    const body = await req.json();
    const nodeId = Number(body?.node_id);
    const sessionId = Number(body?.id);
    if (!Number.isInteger(nodeId) && !Number.isInteger(sessionId)) {
      return Response.json({ error: "node_id or id required" }, { status: 400 });
    }

    // Without an explicit id, the newest session on the node is the one meant —
    // undo is nearly always about what just happened.
    const target = Number.isInteger(sessionId)
      ? await query<{ id: number; node_id: number }>(
          "SELECT id, node_id FROM learn_sessions WHERE id = $1", [sessionId])
      : await query<{ id: number; node_id: number }>(
          "SELECT id, node_id FROM learn_sessions WHERE node_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
          [nodeId]);
    if (target.length === 0) return Response.json({ error: "not_found" }, { status: 404 });

    const node = target[0].node_id;
    await query("DELETE FROM learn_sessions WHERE id = $1", [target[0].id]);

    const rest = await query<{ recall_score: number; created_at: string }>(
      "SELECT recall_score, created_at FROM learn_sessions WHERE node_id = $1 ORDER BY created_at ASC, id ASC",
      [node]);
    const st = replaySessions(
      rest.map(r => ({ recall_score: r.recall_score as RecallScore, created_at: new Date(r.created_at) })),
    );

    await query(
      `UPDATE learn_nodes
          SET ease_factor = $2, interval_days = $3, next_review = $4,
              status = $5, mastery_percent = $6, updated_at = NOW()
        WHERE id = $1`,
      [node, st.ease_factor, st.interval_days, st.next_review, st.status, st.mastery],
    );

    return Response.json({
      ok: true, node_id: node, remaining: rest.length,
      status: st.status, mastery_percent: st.mastery,
      next_review: st.next_review ? st.next_review.toISOString().slice(0, 10) : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
    console.error("learn/sessions DELETE:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
