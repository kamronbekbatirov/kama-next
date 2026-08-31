import { query } from "@/lib/db";

/**
 * Sport: the programme, the sessions, and the body being changed.
 *
 * Owner-only. `paused` on an exercise carries its reason, and the reason is
 * shown wherever the exercise is — a movement on hold for a medical reason must
 * not read as merely "skipped today".
 */

export type Block = "warmup" | "main" | "home" | "posture" | "cardio" | "stretch";
export const BLOCKS: Block[] = ["warmup", "main", "home", "posture", "cardio", "stretch"];

export interface Exercise {
  id: number; block: Block; name: string;
  sets: string | null; reps: string | null; note: string | null;
  paused: boolean; paused_reason: string | null; position: number;
}

const EX_COLS = "id, block, name, sets, reps, note, paused, paused_reason, position";

export async function listExercises(block?: Block): Promise<Exercise[]> {
  return block
    ? query<Exercise>(`SELECT ${EX_COLS} FROM sport_exercises WHERE block = $1 ORDER BY position, id`, [block])
    : query<Exercise>(`SELECT ${EX_COLS} FROM sport_exercises ORDER BY
         CASE block WHEN 'warmup' THEN 1 WHEN 'main' THEN 2 WHEN 'home' THEN 3
                    WHEN 'posture' THEN 4 WHEN 'cardio' THEN 5 ELSE 6 END, position, id`);
}

export async function upsertExercise(e: {
  id?: number; block: Block; name: string;
  sets?: string | null; reps?: string | null; note?: string | null;
  paused?: boolean; paused_reason?: string | null;
}): Promise<Exercise | null> {
  const name = e.name?.trim();
  if (!name) return null;
  const args = [e.block, name, e.sets ?? null, e.reps ?? null, e.note ?? null,
                !!e.paused, e.paused_reason ?? null];
  const rows = e.id
    ? await query<Exercise>(
        `UPDATE sport_exercises SET block=$2, name=$3, sets=$4, reps=$5, note=$6,
                                    paused=$7, paused_reason=$8
          WHERE id=$1 RETURNING ${EX_COLS}`, [e.id, ...args])
    : await query<Exercise>(
        `INSERT INTO sport_exercises (block, name, sets, reps, note, paused, paused_reason, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,
                 COALESCE((SELECT MAX(position)+1 FROM sport_exercises WHERE block=$1), 0))
         RETURNING ${EX_COLS}`, args);
  return rows[0] ?? null;
}

export async function deleteExercise(id: number): Promise<boolean> {
  const r = await query<{ id: number }>("DELETE FROM sport_exercises WHERE id=$1 RETURNING id", [id]);
  return r.length > 0;
}

/** Put a movement on hold, or take it off hold, with the reason attached. */
export async function pauseExercise(id: number, paused: boolean, reason?: string | null) {
  const r = await query<Exercise>(
    `UPDATE sport_exercises SET paused=$2, paused_reason=CASE WHEN $2 THEN $3 ELSE NULL END
      WHERE id=$1 RETURNING ${EX_COLS}`, [id, paused, reason ?? null]);
  return r[0] ?? null;
}

/* ── Sessions ─────────────────────────────────────────────────────────── */

export interface WorkoutSet {
  id: number; exercise_id: number | null; name: string;
  set_no: number; reps: number | null; weight_kg: number | null;
  seconds: number | null; note: string | null;
}
export interface Workout {
  id: number; day: string; kind: string; note: string | null; sets: WorkoutSet[];
}

const WO_COLS = `w.id, w.day::text AS day, w.kind, w.note,
  COALESCE((SELECT json_agg(json_build_object(
      'id', s.id, 'exercise_id', s.exercise_id, 'name', s.name, 'set_no', s.set_no,
      'reps', s.reps, 'weight_kg', s.weight_kg::float, 'seconds', s.seconds, 'note', s.note)
      ORDER BY s.id) FROM sport_sets s WHERE s.workout_id = w.id), '[]'::json) AS sets`;

export async function listWorkouts(limit = 30): Promise<Workout[]> {
  return query<Workout>(`SELECT ${WO_COLS} FROM sport_workouts w ORDER BY w.day DESC, w.id DESC LIMIT $1`, [limit]);
}

export async function getWorkoutForDay(day: string): Promise<Workout | null> {
  const r = await query<Workout>(`SELECT ${WO_COLS} FROM sport_workouts w WHERE w.day = $1::date ORDER BY w.id DESC LIMIT 1`, [day]);
  return r[0] ?? null;
}

export async function startWorkout(day: string, kind = "gym", note?: string | null) {
  const r = await query<{ id: number }>(
    "INSERT INTO sport_workouts (day, kind, note) VALUES ($1::date,$2,$3) RETURNING id",
    [day, ["gym", "home", "cardio", "other"].includes(kind) ? kind : "gym", note ?? null]);
  return r[0]?.id ?? null;
}

export async function addSet(workoutId: number, s: {
  name: string; exerciseId?: number | null; setNo?: number;
  reps?: number | null; weight?: number | null; seconds?: number | null; note?: string | null;
}) {
  const name = s.name?.trim();
  if (!name) return null;
  const r = await query<WorkoutSet>(
    `INSERT INTO sport_sets (workout_id, exercise_id, name, set_no, reps, weight_kg, seconds, note)
     VALUES ($1,$2,$3,COALESCE($4,(SELECT COUNT(*)+1 FROM sport_sets WHERE workout_id=$1 AND name=$3)),$5,$6,$7,$8)
     RETURNING id, exercise_id, name, set_no, reps, weight_kg::float AS weight_kg, seconds, note`,
    [workoutId, s.exerciseId ?? null, name, s.setNo ?? null, s.reps ?? null,
     s.weight ?? null, s.seconds ?? null, s.note ?? null]);
  return r[0] ?? null;
}

export async function removeSet(id: number): Promise<boolean> {
  const r = await query<{ id: number }>("DELETE FROM sport_sets WHERE id=$1 RETURNING id", [id]);
  return r.length > 0;
}

export async function removeWorkout(id: number): Promise<boolean> {
  const r = await query<{ id: number }>("DELETE FROM sport_workouts WHERE id=$1 RETURNING id", [id]);
  return r.length > 0;
}

/**
 * The heaviest set recorded for each exercise, and when.
 *
 * This is what "am I progressing" actually means for this programme: the
 * instruction is one or two more reps, or a little more weight, each week.
 */
export async function personalBests(): Promise<
  { name: string; weight_kg: number | null; reps: number | null; seconds: number | null; day: string }[]
> {
  // Seconds are ordered on too: a plank has no weight and no reps, and without
  // this its "best" came back empty rather than as its longest hold.
  return query(
    `SELECT DISTINCT ON (lower(s.name))
            s.name, s.weight_kg::float AS weight_kg, s.reps, s.seconds, w.day::text AS day
       FROM sport_sets s JOIN sport_workouts w ON w.id = s.workout_id
      ORDER BY lower(s.name),
               s.weight_kg DESC NULLS LAST,
               s.seconds   DESC NULLS LAST,
               s.reps      DESC NULLS LAST,
               w.day DESC`);
}

/* ── Body ─────────────────────────────────────────────────────────────── */

export interface Measurement {
  day: string; weight_kg: number | null; height_cm: number | null; note: string | null;
}

export async function listMeasurements(limit = 60): Promise<Measurement[]> {
  return query<Measurement>(
    `SELECT day::text AS day, weight_kg::float AS weight_kg, height_cm, note
       FROM sport_measurements ORDER BY day DESC LIMIT $1`, [limit]);
}

export async function saveMeasurement(m: {
  day: string; weight?: number | null; height?: number | null; note?: string | null;
}) {
  // Height carries forward: it is asked for once and would otherwise be blanked
  // by every weigh-in that does not repeat it.
  const r = await query<Measurement>(
    `INSERT INTO sport_measurements (day, weight_kg, height_cm, note)
     VALUES ($1::date, $2, COALESCE($3, (SELECT height_cm FROM sport_measurements
                                          WHERE height_cm IS NOT NULL ORDER BY day DESC LIMIT 1)), $4)
     ON CONFLICT (day) DO UPDATE
       SET weight_kg = COALESCE(EXCLUDED.weight_kg, sport_measurements.weight_kg),
           height_cm = COALESCE(EXCLUDED.height_cm, sport_measurements.height_cm),
           note      = COALESCE(EXCLUDED.note, sport_measurements.note)
     RETURNING day::text AS day, weight_kg::float AS weight_kg, height_cm, note`,
    [m.day, m.weight ?? null, m.height ?? null, m.note ?? null]);
  return r[0] ?? null;
}

/* ── Weekly plan ──────────────────────────────────────────────────────── */

/**
 * Which programme blocks run on which weekday.
 *
 * Keyed by weekday rather than date: a training week is a routine, and planning
 * it date by date would mean re-entering the same thing every week. ISO
 * numbering, Monday = 1, matching remind_days and EXTRACT(ISODOW).
 */
export async function getWeekPlan(): Promise<{ weekday: number; block: Block }[]> {
  return query<{ weekday: number; block: Block }>(
    "SELECT weekday, block FROM sport_week ORDER BY weekday, position, block");
}

export async function setWeekBlock(weekday: number, block: Block, on: boolean): Promise<boolean> {
  if (weekday < 1 || weekday > 7) return false;
  if (on) {
    await query(
      `INSERT INTO sport_week (weekday, block, position)
       VALUES ($1,$2,COALESCE((SELECT MAX(position)+1 FROM sport_week WHERE weekday=$1),0))
       ON CONFLICT (weekday, block) DO NOTHING`, [weekday, block]);
  } else {
    await query("DELETE FROM sport_week WHERE weekday=$1 AND block=$2", [weekday, block]);
  }
  return true;
}

/** The blocks due on a given weekday, with their exercises. */
export async function planForWeekday(weekday: number): Promise<{ block: Block; exercises: Exercise[] }[]> {
  const blocks = await query<{ block: Block }>(
    "SELECT block FROM sport_week WHERE weekday = $1 ORDER BY position, block", [weekday]);
  if (blocks.length === 0) return [];
  const all = await listExercises();
  return blocks.map(b => ({ block: b.block, exercises: all.filter(e => e.block === b.block) }));
}

/* ── Editing measurements ─────────────────────────────────────────────── */

/** Correct a weigh-in. A number typed wrong is the commonest thing to fix. */
export async function deleteMeasurement(day: string): Promise<boolean> {
  const r = await query<{ day: string }>(
    "DELETE FROM sport_measurements WHERE day = $1::date RETURNING day::text AS day", [day]);
  return r.length > 0;
}
