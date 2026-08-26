import { requireMember, UNAUTHORIZED } from "@/lib/guard";
import { listSteps, addStep, setStepDone, removeStep, stepWeeks, weekStartOf } from "@/lib/tracker";
import { isoDateIn } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/** Steps on a goal. Everything is scoped to the caller — see src/lib/tracker.ts. */
export async function GET(req: Request) {
  try {
    const s = await requireMember();
    const p = new URL(req.url).searchParams;
    const goalId = Number(p.get("goal_id"));
    if (!Number.isInteger(goalId)) return Response.json({ error: "goal_id required" }, { status: 400 });

    // `week=all` for the history view; otherwise this week's commitments plus
    // any step that belongs to no week at all.
    const all = p.get("week") === "all";
    const week = all ? undefined : weekStartOf(isoDateIn(s.tz ?? "UTC"));
    const [steps, weeks] = await Promise.all([
      listSteps(s.memberId, goalId, week),
      stepWeeks(s.memberId, goalId),
    ]);
    return Response.json({ steps, weeks, week: week ?? null });
  } catch { return UNAUTHORIZED(); }
}

export async function POST(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const goalId = Number(b.goal_id);
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!Number.isInteger(goalId)) return Response.json({ error: "goal_id required" }, { status: 400 });
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    // New steps land in the current week by default: that is what "this week's
    // goals" means, and it is why last week's stop competing for attention.
    const step = await addStep(s.memberId, goalId, title, weekStartOf(isoDateIn(s.tz ?? "UTC")));
    if (!step) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(step);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/steps POST:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const id = Number(b.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const step = await setStepDone(s.memberId, id, !!b.done);
    if (!step) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(step);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/steps PATCH:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const id = Number(b.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    return Response.json({ ok: await removeStep(s.memberId, id) });
  } catch { return UNAUTHORIZED(); }
}
