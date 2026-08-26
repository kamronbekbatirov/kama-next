export interface Goal {
  id: number;
  member_id: string;
  title: string;
  metric_unit: string;
  target_value: number;
  period: "day" | "week";
  cue_when: string;
  action_then: string;
  start_date: string;
  ends_on: string | null;
  status: "active" | "paused" | "archived";
  extras: Record<string, unknown>;
  created_at: string;
  remind_at: string | null;
  remind_days: number[] | null;
}

export interface CheckIn {
  id: number;
  goal_id: number;
  day: string;
  value: number;
  note: string | null;
}

export interface BoardGoal {
  goal_id: number;
  member_id: string;
  display_name: string;
  title: string;
  metric_unit: string;
  target_value: number;
  period: "day" | "week";
  days_done_7: number;
  days_done_30: number;
  current_run: number;
  last_day: string | null;
  has_photo: boolean;
  avatar_color: number;
  steps_total: number;
  steps_done: number;
  steps: { title: string; done: boolean }[];
}

export interface WeekRow {
  member_id: string;
  display_name: string;
  done: number;
  goals: number;
  has_photo: boolean;
  avatar_color: number;
}

export interface Board {
  end: string;
  days: number;
  goals: BoardGoal[];
  week: WeekRow[];
}

export interface GoalStep {
  id: number;
  goal_id: number;
  title: string;
  position: number;
  done_at: string | null;
}
