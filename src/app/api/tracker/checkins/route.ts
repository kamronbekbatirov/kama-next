import { requireMember, UNAUTHORIZED } from "@/lib/guard";
import { checkIn, removeCheckIn, goalCheckIns } from "@/lib/tracker";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The client sends its own `day` because only it knows the member's timezone —
 * the server clock is UTC and would file an evening check-in under yesterday
 * east of Greenwich. It is still clamped server-side so nobody can backfill an
 * arbitrary history.
 */
async function safeDay(raw: unknown): Promise<string | null> {
  const today = await isoToday();
  if (typeof raw !== "string" || !ISO_DATE.test(raw)) return today;
  const min = new Date(`${today}T00:00:00Z`);
  min.setUTCDate(min.getUTCDate() - 7);
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 1);
  const d = new Date(`${raw}T00:00:00Z`);
  if (isNaN(d.getTime()) || d < min || d > max) return null;
  return raw;
}

export async function GET(req: Request) {
  try {
    const s = await requireMember();
    const p = new URL(req.url).searchParams;
    const goalId = Number(p.get("goal_id"));
    if (!Number.isInteger(goalId)) return Response.json({ error: "goal_id required" }, { status: 400 });
    const to = ISO_DATE.test(p.get("to") ?? "") ? p.get("to")! : await isoToday();
    const from = ISO_DATE.test(p.get("from") ?? "") ? p.get("from")! : to;
    return Response.json(await goalCheckIns(s.memberId, goalId, from, to));
  } catch {
    return UNAUTHORIZED();
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const goalId = Number(b.goal_id);
    if (!Number.isInteger(goalId)) return Response.json({ error: "goal_id required" }, { status: 400 });

    const day = await safeDay(b.day);
    if (!day) return Response.json({ error: "day out of range" }, { status: 400 });

    const value = b.value === undefined ? 1 : Number(b.value);
    if (!Number.isFinite(value) || value < 0) {
      return Response.json({ error: "value must be >= 0" }, { status: 400 });
    }

    const ok = await checkIn(s.memberId, goalId, day, value,
      typeof b.note === "string" && b.note.trim() ? b.note.trim() : null);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, day });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/checkins POST:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const goalId = Number(b.goal_id);
    const day = await safeDay(b.day);
    if (!Number.isInteger(goalId) || !day) {
      return Response.json({ error: "goal_id and day required" }, { status: 400 });
    }
    const ok = await removeCheckIn(s.memberId, goalId, day);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/checkins DELETE:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
