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
