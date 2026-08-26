import type { Board, CheckIn, Goal, GoalStep } from "./types";

async function jfetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  return res.json();
}
function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export const trackerApi = {
  listGoals: () => jfetch<Goal[]>("/api/tracker/goals"),
  listArchived: () => jfetch<Goal[]>("/api/tracker/goals?archived=1"),
  restoreGoal: (id: number) =>
    jfetch<{ ok: true } | { error: string }>("/api/tracker/goals", json("PATCH", { id, restore: true })),

  createGoal: (g: {
    title: string; metric_unit: string; target_value: number;
    period: "day" | "week"; cue_when: string; action_then: string; start_date: string; ends_on?: string | null;
    extras?: { woop_outcome?: string; woop_obstacle?: string; stake?: string };
  }) => jfetch<Goal | { error: string }>("/api/tracker/goals", json("POST", g)),

  updateGoal: (id: number, patch: Record<string, unknown>) =>
    jfetch<{ ok: true } | { error: string }>("/api/tracker/goals", json("PATCH", { id, ...patch })),

  setReminder: (id: number, patch: {
    remind_at: string | null; remind_days?: number[] | null;
    remind_interval?: number | null;
  }) =>
    jfetch<{ ok: true } | { error: string }>("/api/tracker/goals", json("PATCH", { id, ...patch })),

  steps: (goal_id: number, all = false) =>
    jfetch<{ steps: GoalStep[]; weeks: string[]; week: string | null }>(
      `/api/tracker/steps?goal_id=${goal_id}${all ? "&week=all" : ""}`),
  addStep: (goal_id: number, title: string) =>
    jfetch<GoalStep | { error: string }>("/api/tracker/steps", json("POST", { goal_id, title })),
  setStepDone: (id: number, done: boolean) =>
    jfetch<GoalStep | { error: string }>("/api/tracker/steps", json("PATCH", { id, done })),
  removeStep: (id: number) =>
    jfetch<{ ok: boolean }>("/api/tracker/steps", json("DELETE", { id })),

  archiveGoal: (id: number) =>
    jfetch<{ ok: true } | { error: string }>("/api/tracker/goals", json("DELETE", { id })),

  checkIn: (goal_id: number, day: string, value: number, note?: string) =>
    jfetch<{ ok: true; day: string } | { error: string }>(
      "/api/tracker/checkins", json("POST", { goal_id, day, value, note })),

  undoCheckIn: (goal_id: number, day: string) =>
    jfetch<{ ok: true } | { error: string }>(
      "/api/tracker/checkins", json("DELETE", { goal_id, day })),

  checkIns: (goal_id: number, from: string, to: string) =>
    jfetch<CheckIn[]>(`/api/tracker/checkins?goal_id=${goal_id}&from=${from}&to=${to}`),

  board: (end: string, days = 30) =>
    jfetch<Board>(`/api/tracker/board?end=${end}&days=${days}`),
};
