import { query } from "@/lib/db";

/**
 * Plain reminders, owned by a member.
 *
 * Kept apart from the tracker's goal reminders on purpose: those quote the
 * goal's own if-then plan and go quiet once the day is logged, which is the
 * whole point of them. These are what someone means when they say "remind me
 * to call the landlord on Fridays" — no goal, no streak, no cleverness.
 */

export interface Reminder {
  id: number;
  member_id: string;
  text: string;
  remind_at: string;
  days: number[] | null;
  once_on: string | null;
  active: boolean;
}

const COLS = `id, member_id, text, to_char(remind_at, 'HH24:MI') AS remind_at,
              days, once_on::text AS once_on, active`;

export async function listReminders(memberId: string): Promise<Reminder[]> {
  return query<Reminder>(
    `SELECT ${COLS} FROM reminders
      WHERE member_id = $1 AND active
      ORDER BY remind_at, id`,
    [memberId],
  );
}

export async function createReminder(memberId: string, r: {
  text: string; at: string; days?: number[] | null; onceOn?: string | null;
}): Promise<Reminder> {
  const rows = await query<Reminder>(
    `INSERT INTO reminders (member_id, text, remind_at, days, once_on)
     VALUES ($1, $2, $3::time, $4, $5::date)
     RETURNING ${COLS}`,
    [memberId, r.text.trim().slice(0, 500), r.at, r.days?.length ? r.days : null, r.onceOn ?? null],
  );
  return rows[0];
}

/** Scoped delete. `WHERE id = $1` alone would reach another member's row. */
export async function deleteReminder(memberId: string, id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    "UPDATE reminders SET active = FALSE WHERE id = $1 AND member_id = $2 AND active RETURNING id",
    [id, memberId],
  );
  return rows.length > 0;
}

export interface DueReminder {
  id: number;
  text: string;
  telegram_id: string | null;
  once_on: string | null;
}

/**
 * Reminders whose time has arrived in their owner's own timezone.
 *
 * `last_fired_on` compared against the member's local date is what keeps a
 * timer that ticks every few minutes from sending the same nudge all day.
 */
export async function dueReminders(defaultTz: string): Promise<DueReminder[]> {
  return query<DueReminder>(
    `WITH ctx AS (
       SELECT r.id, r.text, r.days, r.once_on, r.last_fired_on, r.remind_at,
              m.telegram_id,
              (NOW() AT TIME ZONE COALESCE(m.tz, $1))::date AS local_date,
              (NOW() AT TIME ZONE COALESCE(m.tz, $1))::time AS local_time
         FROM reminders r
         JOIN members m ON m.id = r.member_id AND m.revoked_at IS NULL
        WHERE r.active AND m.telegram_id IS NOT NULL
     )
     SELECT id, text, telegram_id, once_on::text AS once_on
       FROM ctx
      WHERE local_time >= remind_at
        AND (last_fired_on IS NULL OR last_fired_on < local_date)
        AND (once_on IS NULL OR once_on = local_date)
        AND (days IS NULL OR EXTRACT(ISODOW FROM local_date)::smallint = ANY(days))`,
    [defaultTz],
  );
}

export async function markFired(id: number, defaultTz: string): Promise<void> {
  await query(
    `UPDATE reminders r
        SET last_fired_on = (NOW() AT TIME ZONE COALESCE(m.tz, $2))::date,
            -- A one-off has done its job; leaving it active would make it a
            -- daily reminder that never fires again but still shows in lists.
            active = CASE WHEN r.once_on IS NOT NULL THEN FALSE ELSE r.active END
       FROM members m
      WHERE r.id = $1 AND m.id = r.member_id`,
    [id, defaultTz],
  );
}
