import { requireMember, UNAUTHORIZED } from "@/lib/guard";
import { getBoard, getWeek } from "@/lib/tracker";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The shared board: everyone's active goals plus the weekly comparison.
 *
 * This is the one endpoint that reads across members, and that is deliberate —
 * monitoring that others can see is the mechanism the feature is built on. It
 * returns only what the board renders (name, goal, counts); nothing private.
 */
export async function GET(req: Request) {
  try {
    await requireMember();
    const p = new URL(req.url).searchParams;
    const end = ISO_DATE.test(p.get("end") ?? "") ? p.get("end")! : await isoToday();
    const parsed = parseInt(p.get("days") ?? "30", 10);
    const days = Number.isFinite(parsed) ? Math.min(90, Math.max(7, parsed)) : 30;

    const [goals, week] = await Promise.all([getBoard(end, days), getWeek(end)]);
    return Response.json({ end, days, goals, week });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/board:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
