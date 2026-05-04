import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  computeNextReview,
  masteryFromState,
  statusFromHistory,
  type RecallScore,
} from "@/lib/learn/spaced-repetition";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

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
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
