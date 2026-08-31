-- Food: a personal recipe book, a plan, a shopping list and a day's intake.
--
-- Four tables rather than one, because they answer four different questions:
-- what can I cook, what am I cooking this week, what do I need to buy, and what
-- did I actually eat. Merging any two of them makes both worse — a dish is
-- reusable and a meal is a moment.

-- The reference book. Calories are per serving as the dish is normally made.
CREATE TABLE IF NOT EXISTS food_dishes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  kcal        INTEGER,
  protein_g   NUMERIC(6,1),
  fat_g       NUMERIC(6,1),
  carbs_g     NUMERIC(6,1),
  servings    NUMERIC(5,2) NOT NULL DEFAULT 1,
  notes       TEXT,
  recipe      TEXT,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What a dish is made of. Drives the shopping list; free text on purpose, since
-- a grocery list is written the way a shop is walked, not in grams.
CREATE TABLE IF NOT EXISTS food_dish_items (
  id       SERIAL PRIMARY KEY,
  dish_id  INTEGER NOT NULL REFERENCES food_dishes(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  qty      TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

-- The plan: which dish on which day, in which slot.
CREATE TABLE IF NOT EXISTS food_plan (
  id       SERIAL PRIMARY KEY,
  day      DATE NOT NULL,
  slot     TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner','snack')),
  dish_id  INTEGER REFERENCES food_dishes(id) ON DELETE SET NULL,
  note     TEXT,
  UNIQUE (day, slot, dish_id)
);

-- What was actually eaten. kcal_max is the top of a range: a photo estimate is
-- an estimate, and a single number would be a lie about how much is known.
CREATE TABLE IF NOT EXISTS food_entries (
  id         SERIAL PRIMARY KEY,
  day        DATE NOT NULL,
  slot       TEXT CHECK (slot IN ('breakfast','lunch','dinner','snack')),
  name       TEXT NOT NULL,
  kcal       INTEGER,
  kcal_max   INTEGER,
  source     TEXT NOT NULL DEFAULT 'manual'
             CHECK (source IN ('manual','dish','photo','plan')),
  dish_id    INTEGER REFERENCES food_dishes(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  qty        TEXT,
  checked    BOOLEAN NOT NULL DEFAULT FALSE,
  dish_id    INTEGER REFERENCES food_dishes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_entries_day ON food_entries (day);
CREATE INDEX IF NOT EXISTS idx_food_plan_day    ON food_plan (day);
CREATE INDEX IF NOT EXISTS idx_dish_items_dish  ON food_dish_items (dish_id, position);
