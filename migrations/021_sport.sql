-- Sport: the programme, what was actually done, and the body it is changing.
--
-- Three concerns, three tables. An exercise is a template that changes rarely;
-- a workout is a moment; a measurement is a data point. Merging them would mean
-- editing the programme every time a session is logged.

-- The programme. `paused` is not decoration: some movements are on hold for a
-- medical reason, and the reason travels with them so it is visible at the
-- moment someone is about to do one.
CREATE TABLE IF NOT EXISTS sport_exercises (
  id            SERIAL PRIMARY KEY,
  block         TEXT NOT NULL CHECK (block IN ('warmup','main','home','posture','cardio','stretch')),
  name          TEXT NOT NULL,
  sets          TEXT,
  reps          TEXT,
  note          TEXT,
  paused        BOOLEAN NOT NULL DEFAULT FALSE,
  paused_reason TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A session that happened.
CREATE TABLE IF NOT EXISTS sport_workouts (
  id         SERIAL PRIMARY KEY,
  day        DATE NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'gym' CHECK (kind IN ('gym','home','cardio','other')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What was lifted in it. Weight is nullable: a plank has none.
CREATE TABLE IF NOT EXISTS sport_sets (
  id          SERIAL PRIMARY KEY,
  workout_id  INTEGER NOT NULL REFERENCES sport_workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES sport_exercises(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  set_no      INTEGER NOT NULL DEFAULT 1,
  reps        INTEGER,
  weight_kg   NUMERIC(6,2),
  seconds     INTEGER,
  note        TEXT
);

-- The body over time. Height is here too: it is measured the same way and
-- almost never changes, which is exactly why it should not be typed twice.
CREATE TABLE IF NOT EXISTS sport_measurements (
  id         SERIAL PRIMARY KEY,
  day        DATE NOT NULL UNIQUE,
  weight_kg  NUMERIC(5,1),
  height_cm  INTEGER,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sport_ex_block   ON sport_exercises (block, position);
CREATE INDEX IF NOT EXISTS idx_sport_workout_day ON sport_workouts (day DESC);
CREATE INDEX IF NOT EXISTS idx_sport_sets_wo    ON sport_sets (workout_id);
