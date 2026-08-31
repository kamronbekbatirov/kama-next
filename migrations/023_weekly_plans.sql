-- Weekly plans keyed by weekday, not by date.
--
-- A training week and a meal plan are routines, not calendars: "Monday is a gym
-- day" stays true next month, and planning it date by date means re-entering
-- the same thing every week. Weekday 1..7 is ISO — Monday first, matching
-- remind_days and EXTRACT(ISODOW).

-- Which programme blocks run on which weekday.
CREATE TABLE IF NOT EXISTS sport_week (
  id       SERIAL PRIMARY KEY,
  weekday  SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  block    TEXT NOT NULL CHECK (block IN ('warmup','main','home','posture','cardio','stretch')),
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (weekday, block)
);

-- The meal plan becomes weekly too. `day` stays for the rows already written
-- against a date; new rows use weekday.
ALTER TABLE food_plan ALTER COLUMN day DROP NOT NULL;
ALTER TABLE food_plan ADD COLUMN IF NOT EXISTS weekday SMALLINT
  CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7);

CREATE UNIQUE INDEX IF NOT EXISTS idx_food_plan_weekly
  ON food_plan (weekday, slot, dish_id) WHERE weekday IS NOT NULL;
