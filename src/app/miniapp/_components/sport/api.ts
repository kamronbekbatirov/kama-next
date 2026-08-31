import type { Exercise, Workout, Best, Measurement, Block } from "./types";

async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  return fetch(url, opts).then(r => r.json());
}
const body = (method: string, b?: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" },
  ...(b === undefined ? {} : { body: JSON.stringify(b) }),
});
const B = "/api/dashboard/sport";

export const sportApi = {
  program: (block?: Block) => j<Exercise[]>(`${B}/program${block ? `?block=${block}` : ""}`),
  saveExercise: (e: Partial<Exercise> & { block: Block; name: string }) =>
    j<Exercise | { error: string }>(`${B}/program`, body(e.id ? "PATCH" : "POST", e)),
  pauseExercise: (id: number, paused: boolean, paused_reason?: string | null) =>
    j<Exercise | { error: string }>(`${B}/program`, body("PATCH", { id, paused, paused_reason })),
  deleteExercise: (id: number) => j<{ ok: true }>(`${B}/program`, body("DELETE", { id })),

  dayWorkout: (day: string) => j<Workout | null>(`${B}/workouts?day=${day}`),
  recent: () => j<Workout[]>(`${B}/workouts`),
  bests: () => j<Best[]>(`${B}/workouts?bests=1`),
  start: (day: string, kind: string) => j<{ id: number }>(`${B}/workouts`, body("POST", { day, kind })),
  addSet: (workout_id: number, s: Record<string, unknown>) =>
    j<unknown>(`${B}/workouts`, body("POST", { workout_id, ...s })),
  removeSet: (set_id: number) => j<{ ok: true }>(`${B}/workouts`, body("DELETE", { set_id })),
  removeWorkout: (id: number) => j<{ ok: true }>(`${B}/workouts`, body("DELETE", { id })),

  week: () => j<{ weekday: number; block: Block }[]>(`${B}/week`),
  weekday: (weekday: number) => j<{ block: Block; exercises: Exercise[] }[]>(`${B}/week?weekday=${weekday}`),
  setWeekBlock: (weekday: number, block: Block, on: boolean) =>
    j<{ ok: true }>(`${B}/week`, body("POST", { weekday, block, on })),

  body: () => j<Measurement[]>(`${B}/body`),
  saveBody: (m: { day?: string; weight_kg?: number; height_cm?: number; note?: string }) =>
    j<Measurement>(`${B}/body`, body("POST", m)),
  removeBody: (day: string) => j<{ ok: true }>(`${B}/body`, body("DELETE", { day })),
};

/** "70 кг × 12", "40 сек", "12" — whichever the movement is actually measured in. */
export function fmtSet(s: { weight_kg?: number | null; reps?: number | null; seconds?: number | null }): string {
  if (s.weight_kg) return `${s.weight_kg} × ${s.reps ?? "?"}`;
  if (s.seconds) return `${s.seconds} сек`;
  return s.reps ? String(s.reps) : "—";
}
