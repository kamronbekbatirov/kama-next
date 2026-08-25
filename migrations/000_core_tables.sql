-- Core dashboard tables.
--
-- These five tables predate the migrations directory — they were created by
-- hand, so `for f in migrations/*.sql; do psql -f "$f"; done` on a fresh
-- database failed at 003 (`ALTER TABLE todos`) and never produced a working
-- schema. This file backfills them from the live cluster so the documented
-- bootstrap works end to end.
--
-- Numbered 000 so it runs first. Idempotent, like every other migration here:
-- on a populated database every statement is a no-op. Columns added by later
-- migrations (todos.status/position/archived/description/due_at,
-- notes.locked, …) stay in those migrations rather than being folded in here,
-- so the ordering tells the same story it always did.

CREATE TABLE IF NOT EXISTS todos (
  id          SERIAL PRIMARY KEY,
  text        TEXT NOT NULL,
  category    VARCHAR(50) DEFAULT 'general',
  priority    VARCHAR(20) DEFAULT 'medium',
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  done_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_todos_sort ON todos (done, created_at DESC);

-- One row per day. The UNIQUE constraint on `date` is what every
-- `ON CONFLICT (date)` upsert in the app and in anthropic-tools.ts targets.
CREATE TABLE IF NOT EXISTS daily_log (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
  visa_progress   TEXT,
  what_worked     TEXT,
  tomorrow_task   TEXT,
  workout_pushups INTEGER DEFAULT 0,
  workout_plank   INTEGER DEFAULT 0,
  workout_walk    INTEGER DEFAULT 0,
  notes           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id         SERIAL PRIMARY KEY,
  title      TEXT DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id           SERIAL PRIMARY KEY,
  company      TEXT NOT NULL,
  role         TEXT NOT NULL,
  status       VARCHAR(50) DEFAULT 'applied',
  applied_date DATE DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_created ON applications (created_at DESC);

CREATE TABLE IF NOT EXISTS budget_entries (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(10) NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  category    VARCHAR(50),
  description TEXT,
  date        DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_date ON budget_entries (date DESC);

-- App role used by the running service (run as superuser if needed)
GRANT ALL ON TABLE todos, daily_log, notes, applications, budget_entries TO kama_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kama_app;
