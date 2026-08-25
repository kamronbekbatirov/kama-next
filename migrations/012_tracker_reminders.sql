-- Trigger-time reminders for tracker goals.
--
-- The reminder quotes the person's own if-then plan back at them at the moment
-- it applies ("when you put the kettle on, the shoes go by the door"). That is
-- the whole intervention: a plan that is never re-encountered at the right time
-- is just a note.
--
-- Storage is minimal on purpose: a local wall-clock time plus which weekdays it
-- applies to. No timezone column — the member's own `tz` decides, so a person
-- who travels keeps getting reminded at 07:00 their time.

ALTER TABLE tracker_goals ADD COLUMN IF NOT EXISTS remind_at   TIME;
-- ISO weekdays: 1 = Monday … 7 = Sunday. NULL means every day.
ALTER TABLE tracker_goals ADD COLUMN IF NOT EXISTS remind_days SMALLINT[];
-- Last calendar day a reminder was actually sent, so a timer that runs every
-- few minutes cannot send twice.
ALTER TABLE tracker_goals ADD COLUMN IF NOT EXISTS reminded_on DATE;

CREATE INDEX IF NOT EXISTS idx_tracker_goals_remind
  ON tracker_goals (remind_at) WHERE remind_at IS NOT NULL AND status = 'active';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kama_app') THEN
    GRANT ALL ON TABLE tracker_goals TO kama_app;
  END IF;
END $$;
