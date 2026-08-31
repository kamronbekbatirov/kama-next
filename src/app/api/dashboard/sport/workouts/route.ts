import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { listWorkouts, getWorkoutForDay, startWorkout, addSet, removeSet, removeWorkout, personalBests } from "@/lib/sport";
import { isoToday } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fail = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "unauthorized") return UNAUTHORIZED();
  console.error("sport/workouts:", msg);
  return Response.json({ error: "error" }, { status: 500 });
};
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;

export async function GET(req: Request) {
  try {
    await requireOwner();
    const p = new URL(req.url).searchParams;
    if (p.get("day")) {
      const day = ISO.test(p.get("day")!) ? p.get("day")! : await isoToday();
      return Response.json(await getWorkoutForDay(day));
    }
    if (p.get("bests") === "1") return Response.json(await personalBests());
    return Response.json(await listWorkouts(30));
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();

    // Adding a set to an existing session, or starting one — the client should
    // not have to make two round trips to log the first set of the day.
    if (Number.isInteger(b?.workout_id)) {
      const s = await addSet(Number(b.workout_id), {
        name: String(b?.name ?? ""), exerciseId: Number.isInteger(b?.exercise_id) ? b.exercise_id : null,
        reps: num(b?.reps), weight: num(b?.weight_kg), seconds: num(b?.seconds), note: b?.note ?? null,
      });
      return s ? Response.json(s) : Response.json({ error: "name required" }, { status: 400 });
    }

    const day = ISO.test(String(b?.day)) ? String(b.day) : await isoToday();
    const id = await startWorkout(day, String(b?.kind ?? "gym"), b?.note ?? null);
    return Response.json({ id, day });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const b = await req.json();
    if (Number.isInteger(b?.set_id)) {
      const ok = await removeSet(Number(b.set_id));
      return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
    }
    const id = Number(b?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
    const ok = await removeWorkout(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (e) { return fail(e); }
}
