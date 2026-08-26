import { requireMember, UNAUTHORIZED } from "@/lib/guard";
import { isoDateIn, getTimezone } from "@/lib/timezone";
import {
  listGoals, createGoal, updateGoal, archiveGoal, restoreGoal, deleteGoal, validateGoal, setReminder, type NewGoal,
} from "@/lib/tracker";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Everything here is scoped to the calling member — see src/lib/tracker.ts. */
export async function GET(req: Request) {
  try {
    const s = await requireMember();
    const archived = new URL(req.url).searchParams.get("archived") === "1";
    return Response.json(await listGoals(s.memberId, archived));
  } catch {
    return UNAUTHORIZED();
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const draft: Partial<NewGoal> = {
      title: b.title,
      metricUnit: b.metric_unit,
      targetValue: typeof b.target_value === "number" ? b.target_value : Number(b.target_value),
      period: b.period ?? "day",
      cueWhen: b.cue_when,
      actionThen: b.action_then,
      startDate: ISO_DATE.test(String(b.start_date)) ? b.start_date : undefined,
      endsOn: ISO_DATE.test(String(b.ends_on)) ? b.ends_on : null,
      extras: b.extras,
    };
    // The same rules the database enforces, reported as a readable 400 rather
    // than a constraint violation.
    const bad = validateGoal(draft);
    if (bad) return Response.json({ error: bad }, { status: 400 });
    // The client sends its own date so the goal starts on the day the person is
    // actually living in. If it didn't, the member's own zone is a better
    // answer than a 400 — the server knows it too.
    draft.startDate ??= isoDateIn(s.tz ?? (await getTimezone()));

    return Response.json(await createGoal(s.memberId, draft as NewGoal));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/goals POST:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const s = await requireMember();
    const b = await req.json();
    const id = Number(b.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });

    // A reminder is set on its own endpoint-shaped field rather than folded
    // into the generic patch, because clearing it means writing NULL and
    // COALESCE cannot express that.
    if (b.restore === true) {
      const ok = await restoreGoal(s.memberId, id);
      return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
    }

    if ("remind_at" in b) {
      const at = TIME_RE.test(String(b.remind_at)) ? String(b.remind_at) : null;
      const days = Array.isArray(b.remind_days)
        ? (b.remind_days as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7)
        : null;
      const interval = Number.isInteger(b.remind_interval) && Number(b.remind_interval) >= 2
        ? Math.min(60, Number(b.remind_interval))
        : null;
      const anchor = ISO_DATE.test(String(b.remind_anchor))
        ? String(b.remind_anchor)
        : isoDateIn(s.tz ?? (await getTimezone()));
      const ok = await setReminder(
        s.memberId, id, at, days && days.length ? days : null,
        at ? interval : null, at ? anchor : null,
      );
      return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
    }

    const ok = await updateGoal(s.memberId, id, {
      title: b.title, metricUnit: b.metric_unit,
      targetValue: b.target_value === undefined ? undefined : Number(b.target_value),
      period: b.period, cueWhen: b.cue_when, actionThen: b.action_then,
      endsOn: b.ends_on, status: b.status, extras: b.extras,
    });
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/goals PATCH:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireMember();
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });

    // Archiving stays the default. Deleting has to be asked for by name,
    // because it takes the check-ins and steps with it and nothing brings
    // them back.
    if (body?.purge === true) {
      const gone = await deleteGoal(s.memberId, id);
      if (!gone) return Response.json({ error: "not_found" }, { status: 404 });
      return Response.json({ ok: true, deleted: gone });
    }

    const ok = await archiveGoal(s.memberId, id);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("tracker/goals DELETE:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
