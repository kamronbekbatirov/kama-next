export type Block = "warmup" | "main" | "home" | "posture" | "cardio" | "stretch";
export const BLOCKS: Block[] = ["warmup", "main", "home", "posture", "cardio", "stretch"];

export interface Exercise {
  id: number; block: Block; name: string;
  sets: string | null; reps: string | null; note: string | null;
  paused: boolean; paused_reason: string | null; position: number;
}

export interface WorkoutSet {
  id: number; exercise_id: number | null; name: string;
  set_no: number; reps: number | null; weight_kg: number | null;
  seconds: number | null; note: string | null;
}

export interface Workout {
  id: number; day: string; kind: string; note: string | null; sets: WorkoutSet[];
}

export interface Best {
  name: string; weight_kg: number | null; reps: number | null; seconds: number | null; day: string;
}

export interface Measurement {
  day: string; weight_kg: number | null; height_cm: number | null; note: string | null;
}
