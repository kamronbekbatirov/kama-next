import { query } from "@/lib/db";

/**
 * Shared goal tracker.
 *
 * Every function here takes an explicit `memberId` and every statement filters
 * on it. That is the invariant a security review can grep for: this file must
 * never mention a table belonging to the owner's private dashboard.
 *
 * The one deliberate exception is `getBoard()`, which reads across members —
 * that is the whole point of the feature (shared, comparative monitoring), and
 * it uses an explicit column list so a future column cannot leak into it.
 */

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
  remind_at: string | null;      // "HH:MM" in the member's own timezone
  remind_days: number[] | null;  // ISO weekdays 1–7; null = every day
}

export interface CheckIn {
  id: number;
  goal_id: number;
  day: string;
  value: number;
  note: string | null;
}

const GOAL_COLS = `id, member_id, title, metric_unit, target_value::float AS target_value,
  period, cue_when, action_then, start_date::text AS start_date, ends_on::text AS ends_on,
  status, extras, created_at::text AS created_at,
  to_char(remind_at, 'HH24:MI') AS remind_at, remind_days`;

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function listGoals(memberId: string): Promise<Goal[]> {
  return query<Goal>(
    `SELECT ${GOAL_COLS} FROM tracker_goals
      WHERE member_id = $1 AND status <> 'archived'
      ORDER BY created_at ASC`,
    [memberId],
  );
}

export interface NewGoal {
  title: string;
  metricUnit: string;
  targetValue: number;
  period: "day" | "week";
  cueWhen: string;
  actionThen: string;
  startDate: string;
  endsOn?: string | null;
  extras?: GoalExtras;
}

/**
 * Optional depth, kept in one JSONB column so later additions need no
 * migration.
 *
 * The WOOP pair is deliberately only two fields: the "wish" is the goal title
 * and the "plan" is the if-then pair the goal already requires, so asking for
 * them again would be a form that repeats itself.
 */
export interface GoalExtras {
  woop_outcome?: string;   // what will be better when this is done
  woop_obstacle?: string;  // the thing that usually gets in the way
  stake?: string;          // what happens if it does not
}

function cleanExtras(e: unknown): GoalExtras {
  const src = (e ?? {}) as Record<string, unknown>;
  const out: GoalExtras = {};
  for (const k of ["woop_outcome", "woop_obstacle", "stake"] as const) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 2000);
  }
  return out;
}

/**
 * Validation lives here, not only in the form.
 *
 * The research this feature is built on is specific: a goal without a
 * measurable target and without an if-then plan is the kind that does not get
 * done. The database enforces the same rules, so neither the UI nor the bot can
 * create a goal that skips them.
 */
/**
 * The cue is rendered inside a sentence that already supplies the conjunction
 * ("Когда <cue> — <action>"), so a cue that starts with one of its own reads
 * "Когда когда сварю кофе". People write it that way, and so does the model
 * when it echoes them, so strip it at the single point where cues are written
 * rather than at each of the three places they are shown.
 */
function normaliseCue(raw: string): string {
  const t = raw.trim();
  const stripped = t.replace(/^(когда|если|when|if|agar|qachon)\s+/iu, "");
  return (stripped || t).replace(/^[,\s]+/, "");
}

export function validateGoal(g: Partial<NewGoal>): string | null {
  if (!g.title?.trim()) return "title required";
  if (!g.metricUnit?.trim()) return "metric_unit required";
  if (typeof g.targetValue !== "number" || !(g.targetValue > 0)) {
    return "target_value must be a number greater than 0";
  }
  if (!g.cueWhen?.trim()) return "cue_when required — an if-then plan needs the situation";
  if (!g.actionThen?.trim()) return "action_then required — an if-then plan needs the action";
  if (g.period && g.period !== "day" && g.period !== "week") return "period must be day or week";
  return null;
}

export async function createGoal(memberId: string, g: NewGoal): Promise<Goal> {
  const rows = await query<Goal>(
    `INSERT INTO tracker_goals
       (member_id, title, metric_unit, target_value, period, cue_when, action_then, start_date, ends_on, extras)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING ${GOAL_COLS}`,
    [memberId, g.title.trim(), g.metricUnit.trim(), g.targetValue, g.period ?? "day",
     normaliseCue(g.cueWhen), g.actionThen.trim(), g.startDate, g.endsOn ?? null,
     JSON.stringify(cleanExtras(g.extras))],
  );
  return rows[0];
}

/** Scoped update. `WHERE id = $1` alone would be a cross-member write. */
export async function updateGoal(
  memberId: string, id: number, patch: Partial<NewGoal & { status: Goal["status"] }>,
): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE tracker_goals SET
       title        = COALESCE($3, title),
       metric_unit  = COALESCE($4, metric_unit),
       target_value = COALESCE($5, target_value),
       period       = COALESCE($6, period),
       cue_when     = COALESCE($7, cue_when),
       action_then  = COALESCE($8, action_then),
       ends_on      = COALESCE($9, ends_on),
       status       = COALESCE($10, status),
       extras       = COALESCE($11::jsonb, extras),
       updated_at   = NOW()
     WHERE id = $1 AND member_id = $2
     RETURNING id`,
    [id, memberId, patch.title ?? null, patch.metricUnit ?? null,
     patch.targetValue ?? null, patch.period ?? null,
     patch.cueWhen === undefined ? null : normaliseCue(patch.cueWhen),
     patch.actionThen ?? null, patch.endsOn ?? null, patch.status ?? null,
     patch.extras === undefined ? null : JSON.stringify(cleanExtras(patch.extras))],
  );
  return rows.length > 0;
}

export async function archiveGoal(memberId: string, id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE tracker_goals SET status = 'archived', updated_at = NOW()
      WHERE id = $1 AND member_id = $2 RETURNING id`,
    [id, memberId],
  );
  return rows.length > 0;
}

// ─── Check-ins ───────────────────────────────────────────────────────────────

/**
 * Record progress for one day. Idempotent: one row per goal per day, so tapping
 * twice corrects the number instead of double-counting.
 *
 * `day` comes from the client, which knows its own timezone. The server clock
 * is UTC and would put an evening check-in on the wrong date east of Greenwich.
 */
export async function checkIn(
  memberId: string, goalId: number, day: string, value: number, note: string | null,
  source: "app" | "bot" = "app",
): Promise<boolean> {
  const owned = await query<{ id: number }>(
    "SELECT id FROM tracker_goals WHERE id = $1 AND member_id = $2",
    [goalId, memberId],
  );
  if (owned.length === 0) return false;

  await query(
    `INSERT INTO tracker_checkins (goal_id, member_id, day, value, note, source)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (goal_id, day) DO UPDATE
       SET value = EXCLUDED.value, note = EXCLUDED.note,
           source = EXCLUDED.source, updated_at = NOW()`,
    [goalId, memberId, day, value, note, source],
  );
  return true;
}

export async function removeCheckIn(memberId: string, goalId: number, day: string): Promise<boolean> {
  const rows = await query<{ id: number }>(
    "DELETE FROM tracker_checkins WHERE goal_id = $1 AND member_id = $2 AND day = $3 RETURNING id",
    [goalId, memberId, day],
  );
  return rows.length > 0;
}

export async function goalCheckIns(memberId: string, goalId: number, from: string, to: string) {
  return query<CheckIn>(
    `SELECT id, goal_id, day::text AS day, value::float AS value, note
       FROM tracker_checkins
      WHERE goal_id = $1 AND member_id = $2 AND day >= $3::date AND day <= $4::date
      ORDER BY day DESC`,
    [goalId, memberId, from, to],
  );
}

// ─── The shared board ────────────────────────────────────────────────────────

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
}

/**
 * Everyone's active goals with their recent activity — the first screen.
 *
 * Note what is NOT computed: a broken-streak flag. The habit literature this is
 * built on measures automation in months with enormous spread, and a single
 * missed day is ordinary. `current_run` is shown as a neutral count of
 * consecutive days up to today, never as something that was "lost".
 */
export async function getBoard(end: string, days = 30): Promise<BoardGoal[]> {
  return query<BoardGoal>(
    `WITH win AS (
       SELECT c.goal_id, c.day
         FROM tracker_checkins c
        WHERE c.day > $1::date - $2::int AND c.day <= $1::date AND c.value > 0
     ),
     runs AS (
       SELECT goal_id, day,
              day - (ROW_NUMBER() OVER (PARTITION BY goal_id ORDER BY day))::int AS grp
         FROM win
     ),
     current_run AS (
       SELECT goal_id, COUNT(*)::int AS len
         FROM runs
        WHERE grp = (SELECT r2.grp FROM runs r2
                      WHERE r2.goal_id = runs.goal_id
                      ORDER BY r2.day DESC LIMIT 1)
          AND (SELECT MAX(r3.day) FROM runs r3 WHERE r3.goal_id = runs.goal_id)
              >= $1::date - 1
        GROUP BY goal_id
     )
     SELECT g.id AS goal_id, g.member_id, m.display_name,
            (m.photo_file_id IS NOT NULL) AS has_photo,
            CASE WHEN m.telegram_id ~ '^-?[0-9]+$'
                 THEN abs(m.telegram_id::bigint % 7)::int
                 ELSE abs(hashtext(m.id) % 7)::int END AS avatar_color, g.title, g.metric_unit,
            g.target_value::float AS target_value, g.period,
            COALESCE(SUM(CASE WHEN w.day > $1::date - 7 THEN 1 ELSE 0 END), 0)::int AS days_done_7,
            COALESCE(COUNT(w.day), 0)::int                                          AS days_done_30,
            COALESCE(MAX(cr.len), 0)::int                                           AS current_run,
            MAX(w.day)::text                                                        AS last_day
       FROM tracker_goals g
       JOIN members m ON m.id = g.member_id AND m.revoked_at IS NULL
       LEFT JOIN win w        ON w.goal_id = g.id
       LEFT JOIN current_run cr ON cr.goal_id = g.id
      WHERE g.status = 'active'
      GROUP BY g.id, m.id, g.member_id, g.title,
               g.metric_unit, g.target_value, g.period
      ORDER BY m.display_name, g.created_at`,
    [end, days],
  );
}

/** "Who did how much this week" — the comparison the first screen leads with. */
export async function getWeek(end: string): Promise<{ member_id: string; display_name: string; done: number; goals: number; has_photo: boolean; avatar_color: number }[]> {
  return query(
    `SELECT m.id AS member_id, m.display_name,
            (m.photo_file_id IS NOT NULL) AS has_photo,
            CASE WHEN m.telegram_id ~ '^-?[0-9]+$'
                 THEN abs(m.telegram_id::bigint % 7)::int
                 ELSE abs(hashtext(m.id) % 7)::int END AS avatar_color,
            COALESCE(COUNT(DISTINCT (c.goal_id, c.day)) FILTER (WHERE c.value > 0), 0)::int AS done,
            COUNT(DISTINCT g.id)::int AS goals
       FROM members m
       LEFT JOIN tracker_goals g ON g.member_id = m.id AND g.status = 'active'
       LEFT JOIN tracker_checkins c ON c.goal_id = g.id
            AND c.day > $1::date - 7 AND c.day <= $1::date
      WHERE m.revoked_at IS NULL
      GROUP BY m.id
      ORDER BY done DESC, m.display_name`,
    [end],
  );
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export interface DueReminder {
  goal_id: number;
  member_id: string;
  telegram_id: string | null;
  title: string;
  cue_when: string;
  action_then: string;
  metric_unit: string;
  target_value: number;
  tz: string | null;
}

/**
 * Goals whose reminder time has arrived in the member's own timezone and that
 * have not already been checked in today.
 *
 * There is no point nudging someone about something they already did, and the
 * `reminded_on` guard means a timer running every few minutes still sends at
 * most one reminder per goal per day.
 */
export async function dueReminders(defaultTz: string): Promise<DueReminder[]> {
  return query<DueReminder>(
    `WITH ctx AS (
       SELECT g.id, g.member_id, g.title, g.cue_when, g.action_then,
              g.metric_unit, g.target_value, g.remind_at, g.remind_days,
              g.reminded_on, m.telegram_id, m.tz,
              (NOW() AT TIME ZONE COALESCE(m.tz, $1))::date AS local_date,
              (NOW() AT TIME ZONE COALESCE(m.tz, $1))::time AS local_time
         FROM tracker_goals g
         JOIN members m ON m.id = g.member_id AND m.revoked_at IS NULL
        WHERE g.status = 'active' AND g.remind_at IS NOT NULL AND m.telegram_id IS NOT NULL
     )
     SELECT id AS goal_id, member_id, telegram_id, title, cue_when, action_then,
            metric_unit, target_value::float AS target_value, tz
       FROM ctx
      WHERE local_time >= remind_at
        AND (reminded_on IS NULL OR reminded_on < local_date)
        AND (remind_days IS NULL
             OR EXTRACT(ISODOW FROM local_date)::smallint = ANY(remind_days))
        AND NOT EXISTS (
          SELECT 1 FROM tracker_checkins c
           WHERE c.goal_id = ctx.id AND c.day = ctx.local_date AND c.value > 0
        )`,
    [defaultTz],
  );
}

/** Stamp a goal as reminded for the member's current local day. */
export async function markReminded(goalId: number, defaultTz: string): Promise<void> {
  await query(
    `UPDATE tracker_goals g
        SET reminded_on = (NOW() AT TIME ZONE COALESCE(m.tz, $2))::date
       FROM members m
      WHERE g.id = $1 AND m.id = g.member_id`,
    [goalId, defaultTz],
  );
}

export async function setReminder(
  memberId: string, goalId: number, at: string | null, days: number[] | null,
): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE tracker_goals
        SET remind_at = $3::time, remind_days = $4::smallint[],
            reminded_on = NULL, updated_at = NOW()
      WHERE id = $1 AND member_id = $2
      RETURNING id`,
    [goalId, memberId, at, days],
  );
  return rows.length > 0;
}
