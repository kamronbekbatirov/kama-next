-- A day's log keeps a snapshot of what the day actually contained.
--
-- The reflection fields are what you write; this is what you did — tasks
-- finished, the session trained, what was eaten — captured at the moment the
-- day is closed. Stored rather than recomputed on read, because a log is a
-- record of a day and those tables keep moving afterwards.
ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS summary JSONB;
