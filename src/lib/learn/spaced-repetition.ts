export type RecallScore = 1 | 2 | 3 | 4 | 5;

export interface SrState {
  ease_factor: number;
  interval_days: number;
  next_review: Date;
}

const EASE_FLOOR = 1.3;
const EASE_CEIL = 3.0;
const MAX_INTERVAL_DAYS = 60;

export function computeNextReview(
  current: { ease_factor: number; interval_days: number },
  score: RecallScore,
  now: Date = new Date(),
): SrState {
  let ease = current.ease_factor || 2.5;
  let interval = current.interval_days || 0;
  const nextReview = new Date(now);

  switch (score) {
    case 5: {
      ease = Math.min(EASE_CEIL, ease + 0.15);
      interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round((interval || 1) * ease)));
      nextReview.setDate(nextReview.getDate() + interval);
      break;
    }
    case 4: {
      interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round((interval || 1) * ease)));
      nextReview.setDate(nextReview.getDate() + interval);
      break;
    }
    case 3: {
      ease = Math.max(EASE_FLOOR, ease - 0.15);
      interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round((interval || 1) * 1.3)));
      nextReview.setDate(nextReview.getDate() + interval);
      break;
    }
    case 2: {
      ease = 2.0;
      interval = 1;
      nextReview.setDate(nextReview.getDate() + 1);
      break;
    }
    case 1: {
      ease = Math.max(EASE_FLOOR, ease - 0.3);
      interval = 0;
      nextReview.setHours(nextReview.getHours() + 4);
      break;
    }
  }

  return { ease_factor: ease, interval_days: interval, next_review: nextReview };
}

export function statusFromHistory(
  score: RecallScore,
  prevStatus: string,
): "not_started" | "learning" | "reviewing" | "mastered" {
  if (score >= 4 && (prevStatus === "reviewing" || prevStatus === "mastered")) return "mastered";
  if (score >= 4) return "reviewing";
  if (score >= 2) return "learning";
  return "learning";
}

export function masteryFromState(ease: number, interval: number): number {
  const intervalScore = Math.min(60, interval) / 60;
  const easeScore = Math.max(0, Math.min(1, (ease - EASE_FLOOR) / (EASE_CEIL - EASE_FLOOR)));
  return Math.round((intervalScore * 0.7 + easeScore * 0.3) * 100);
}

/**
 * The state a node starts in, before any recall has been logged.
 *
 * Named rather than repeated, because undoing back to zero has to land on
 * exactly the values a fresh node has — otherwise "undo" leaves a node that
 * looks untouched but schedules differently.
 */
export const INITIAL_SR = { ease_factor: 2.5, interval_days: 0 } as const;

/**
 * Recompute a node's state from its full history of recalls.
 *
 * Replay rather than arithmetic in reverse: the update is lossy (a score of 2
 * resets ease to a constant, so the previous value is unrecoverable), and each
 * step depends on when it happened. Replaying with the original timestamps
 * reproduces the state exactly.
 */
export function replaySessions(
  sessions: { recall_score: RecallScore; created_at: Date }[],
): { ease_factor: number; interval_days: number; next_review: Date | null;
     status: "not_started" | "learning" | "reviewing" | "mastered"; mastery: number } {
  let state: { ease_factor: number; interval_days: number } = { ...INITIAL_SR };
  let next: Date | null = null;
  let status: "not_started" | "learning" | "reviewing" | "mastered" = "not_started";

  for (const s of sessions) {
    const step = computeNextReview(state, s.recall_score, s.created_at);
    state = { ease_factor: step.ease_factor, interval_days: step.interval_days };
    next = step.next_review;
    status = statusFromHistory(s.recall_score, status);
  }

  return {
    ...state,
    next_review: next,
    status,
    mastery: sessions.length === 0 ? 0 : masteryFromState(state.ease_factor, state.interval_days),
  };
}
