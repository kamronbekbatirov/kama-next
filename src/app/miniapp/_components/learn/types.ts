export interface LearnSubject {
  id: number;
  title: string;
  emoji: string | null;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type LearnStatus = "not_started" | "learning" | "reviewing" | "mastered";

export interface LearnNode {
  id: number;
  subject_id: number;
  parent_id: number | null;
  title: string;
  description: string | null;
  status: LearnStatus;
  mastery_percent: number;
  position: number;
  next_review: string | null;
  ease_factor: number;
  interval_days: number;
  resources: { label: string; url: string }[];
  created_at: string;
  updated_at: string;
}

export interface LearnSession {
  id: number;
  node_id: number;
  recall_score: number;
  notes: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export type MethodKind = "woop" | "two_minute" | "if_then" | "goal" | "commitment" | "intrinsic";

export interface LearnMethodEntry {
  id: number;
  method: MethodKind;
  title: string | null;
  data: Record<string, unknown>;
  subject_id: number | null;
  node_id: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewQueueItem extends LearnNode {
  subject_title: string;
  subject_emoji: string | null;
}
