-- Replace the legacy key/value `habits` table with the wide-column shape
-- the rest of the codebase has always assumed (one row per date, columns
-- per prayer + builtin habit). The old table held no data.

DROP TABLE IF EXISTS habits;

CREATE TABLE habits (
  date      DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  fajr      BOOLEAN NOT NULL DEFAULT FALSE,
  dhuhr     BOOLEAN NOT NULL DEFAULT FALSE,
  asr       BOOLEAN NOT NULL DEFAULT FALSE,
  maghrib   BOOLEAN NOT NULL DEFAULT FALSE,
  isha      BOOLEAN NOT NULL DEFAULT FALSE,
  water     BOOLEAN NOT NULL DEFAULT FALSE,
  walk      BOOLEAN NOT NULL DEFAULT FALSE,
  workout   BOOLEAN NOT NULL DEFAULT FALSE,
  breakfast BOOLEAN NOT NULL DEFAULT FALSE,
  quran     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habits_date ON habits (date DESC);

-- App role used by the running service (run as superuser if needed)
GRANT ALL ON TABLE habits TO kama_app;
