import { query } from "@/lib/db";

/**
 * Food: a recipe book, a plan, a shopping list, and what was actually eaten.
 *
 * Owner-only, like the rest of the dashboard — guests never reach any of this.
 *
 * Calories are stored as a range wherever they were estimated rather than
 * counted. `kcal` alone means a known figure; `kcal` with `kcal_max` means
 * "somewhere between these", which is the honest shape for a photo estimate and
 * the reason a single number is never invented for one.
 */

export interface Dish {
  id: number;
  name: string;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  servings: number;
  notes: string | null;
  recipe: string | null;
  items: { id: number; name: string; qty: string | null }[];
}

const DISH_COLS = `d.id, d.name, d.kcal, d.protein_g::float AS protein_g,
  d.fat_g::float AS fat_g, d.carbs_g::float AS carbs_g, d.servings::float AS servings,
  d.notes, d.recipe,
  COALESCE((SELECT json_agg(json_build_object('id', i.id, 'name', i.name, 'qty', i.qty)
                            ORDER BY i.position, i.id)
              FROM food_dish_items i WHERE i.dish_id = d.id), '[]'::json) AS items`;

export async function listDishes(includeArchived = false): Promise<Dish[]> {
  return query<Dish>(
    `SELECT ${DISH_COLS} FROM food_dishes d
      WHERE ${includeArchived ? "TRUE" : "d.archived = FALSE"}
      ORDER BY d.name`,
  );
}

export async function getDish(id: number): Promise<Dish | null> {
  const rows = await query<Dish>(`SELECT ${DISH_COLS} FROM food_dishes d WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface DishInput {
  name: string;
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  servings?: number | null;
  notes?: string | null;
  recipe?: string | null;
  items?: { name: string; qty?: string | null }[];
}

export async function upsertDish(input: DishInput, id?: number): Promise<Dish | null> {
  const name = input.name?.trim();
  if (!name) return null;
  const vals = [
    name, input.kcal ?? null, input.protein_g ?? null, input.fat_g ?? null,
    input.carbs_g ?? null, input.servings ?? 1, input.notes ?? null, input.recipe ?? null,
  ];

  const rows = id
    ? await query<{ id: number }>(
        `UPDATE food_dishes SET name=$2, kcal=$3, protein_g=$4, fat_g=$5, carbs_g=$6,
                                servings=$7, notes=$8, recipe=$9, updated_at=NOW()
          WHERE id=$1 RETURNING id`, [id, ...vals])
    : await query<{ id: number }>(
        `INSERT INTO food_dishes (name, kcal, protein_g, fat_g, carbs_g, servings, notes, recipe)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, vals);
  if (rows.length === 0) return null;
  const dishId = rows[0].id;

  // Ingredients are replaced wholesale: they are a list, and editing one by
  // patching rows individually would need ids the caller does not have.
  if (input.items) {
    await query("DELETE FROM food_dish_items WHERE dish_id = $1", [dishId]);
    let pos = 0;
    for (const it of input.items) {
      const n = it.name?.trim();
      if (!n) continue;
      await query(
        "INSERT INTO food_dish_items (dish_id, name, qty, position) VALUES ($1,$2,$3,$4)",
        [dishId, n.slice(0, 200), it.qty?.trim()?.slice(0, 60) || null, pos++],
      );
    }
  }
  return getDish(dishId);
}

export async function archiveDish(id: number): Promise<boolean> {
  const r = await query<{ id: number }>(
    "UPDATE food_dishes SET archived = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
  return r.length > 0;
}

export async function deleteDish(id: number): Promise<boolean> {
  const r = await query<{ id: number }>("DELETE FROM food_dishes WHERE id = $1 RETURNING id", [id]);
  return r.length > 0;
}

/* ── Plan ─────────────────────────────────────────────────────────────── */

export interface PlanRow {
  id: number; day: string | null; weekday: number | null; slot: string;
  dish_id: number | null; dish_name: string | null; kcal: number | null; note: string | null;
}

const PLAN_COLS = `p.id, p.day::text AS day, p.weekday, p.slot, p.dish_id,
  d.name AS dish_name, d.kcal, p.note`;
const SLOT_ORDER = `CASE p.slot WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2
                                WHEN 'dinner' THEN 3 ELSE 4 END`;

/**
 * The weekly plan, keyed by weekday.
 *
 * A meal plan is a routine, not a calendar — "Monday is oats" stays true next
 * month, and planning it date by date would mean retyping the same week
 * forever.
 */
export async function getWeekPlan(): Promise<PlanRow[]> {
  return query<PlanRow>(
    `SELECT ${PLAN_COLS} FROM food_plan p LEFT JOIN food_dishes d ON d.id = p.dish_id
      WHERE p.weekday IS NOT NULL ORDER BY p.weekday, ${SLOT_ORDER}`);
}

/** What is planned for one weekday — used by "today". */
export async function getPlanForWeekday(weekday: number): Promise<PlanRow[]> {
  return query<PlanRow>(
    `SELECT ${PLAN_COLS} FROM food_plan p LEFT JOIN food_dishes d ON d.id = p.dish_id
      WHERE p.weekday = $1 ORDER BY ${SLOT_ORDER}`, [weekday]);
}

export async function getPlan(from: string, to: string): Promise<PlanRow[]> {
  return query<PlanRow>(
    `SELECT ${PLAN_COLS} FROM food_plan p LEFT JOIN food_dishes d ON d.id = p.dish_id
      WHERE p.day BETWEEN $1::date AND $2::date ORDER BY p.day, ${SLOT_ORDER}`,
    [from, to],
  );
}

export async function addToWeekPlan(weekday: number, slot: string, dishId: number) {
  const rows = await query<{ id: number }>(
    `INSERT INTO food_plan (weekday, slot, dish_id) VALUES ($1,$2,$3)
     ON CONFLICT (weekday, slot, dish_id) WHERE weekday IS NOT NULL DO NOTHING
     RETURNING id`,
    [weekday, slot, dishId],
  );
  return rows[0] ?? null;
}

export async function addToPlan(day: string, slot: string, dishId: number | null, note?: string | null) {
  const rows = await query<{ id: number }>(
    `INSERT INTO food_plan (day, slot, dish_id, note) VALUES ($1::date,$2,$3,$4)
     ON CONFLICT (day, slot, dish_id) DO UPDATE SET note = EXCLUDED.note
     RETURNING id`,
    [day, slot, dishId, note ?? null],
  );
  return rows[0] ?? null;
}

export async function removeFromPlan(id: number): Promise<boolean> {
  const r = await query<{ id: number }>("DELETE FROM food_plan WHERE id = $1 RETURNING id", [id]);
  return r.length > 0;
}

/* ── Diary ────────────────────────────────────────────────────────────── */

export interface Entry {
  id: number; day: string; slot: string | null; name: string;
  kcal: number | null; kcal_max: number | null; source: string;
  dish_id: number | null; note: string | null;
}

export async function getDay(day: string): Promise<Entry[]> {
  return query<Entry>(
    `SELECT id, day::text AS day, slot, name, kcal, kcal_max, source, dish_id, note
       FROM food_entries WHERE day = $1::date ORDER BY created_at`,
    [day],
  );
}

export async function addEntry(e: {
  day: string; name: string; slot?: string | null;
  kcal?: number | null; kcal_max?: number | null;
  source?: string; dishId?: number | null; note?: string | null;
}): Promise<Entry | null> {
  const name = e.name?.trim();
  if (!name) return null;
  const src = ["manual", "dish", "photo", "plan"].includes(e.source ?? "") ? e.source! : "manual";
  const rows = await query<Entry>(
    `INSERT INTO food_entries (day, slot, name, kcal, kcal_max, source, dish_id, note)
     VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, day::text AS day, slot, name, kcal, kcal_max, source, dish_id, note`,
    [e.day, e.slot ?? null, name.slice(0, 300), e.kcal ?? null, e.kcal_max ?? null,
     src, e.dishId ?? null, e.note ?? null],
  );
  return rows[0] ?? null;
}

export async function removeEntry(id: number): Promise<boolean> {
  const r = await query<{ id: number }>("DELETE FROM food_entries WHERE id = $1 RETURNING id", [id]);
  return r.length > 0;
}

/**
 * A day's total, as a range.
 *
 * `kcal_max` is only set on estimates, so the low end is the sum of everything
 * and the high end swaps in the upper bound wherever there is one. When nothing
 * was estimated the two numbers are equal and the UI shows a single figure.
 */
export async function dayTotal(day: string): Promise<{ min: number; max: number; count: number }> {
  const rows = await query<{ min: number; max: number; count: number }>(
    `SELECT COALESCE(SUM(kcal), 0)::int AS min,
            COALESCE(SUM(COALESCE(kcal_max, kcal)), 0)::int AS max,
            COUNT(*)::int AS count
       FROM food_entries WHERE day = $1::date`,
    [day],
  );
  return rows[0] ?? { min: 0, max: 0, count: 0 };
}

/* ── Shopping ─────────────────────────────────────────────────────────── */

export interface ShopItem {
  id: number; name: string; qty: string | null; checked: boolean; dish_id: number | null;
}

export async function listShopping(): Promise<ShopItem[]> {
  return query<ShopItem>(
    "SELECT id, name, qty, checked, dish_id FROM shopping_items ORDER BY checked, id");
}

export async function addShopping(name: string, qty?: string | null, dishId?: number | null) {
  const n = name?.trim();
  if (!n) return null;
  const rows = await query<ShopItem>(
    `INSERT INTO shopping_items (name, qty, dish_id) VALUES ($1,$2,$3)
     RETURNING id, name, qty, checked, dish_id`,
    [n.slice(0, 200), qty?.trim()?.slice(0, 60) || null, dishId ?? null]);
  return rows[0] ?? null;
}

/** Push every ingredient of a dish onto the list, skipping what is already on it. */
export async function addDishToShopping(dishId: number): Promise<number> {
  const rows = await query<{ added: number }>(
    `WITH ins AS (
       INSERT INTO shopping_items (name, qty, dish_id)
       SELECT i.name, i.qty, i.dish_id
         FROM food_dish_items i
        WHERE i.dish_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM shopping_items s
             WHERE lower(s.name) = lower(i.name) AND s.checked = FALSE)
       RETURNING 1
     ) SELECT COUNT(*)::int AS added FROM ins`,
    [dishId]);
  return rows[0]?.added ?? 0;
}

export async function setShoppingChecked(id: number, checked: boolean): Promise<boolean> {
  const r = await query<{ id: number }>(
    "UPDATE shopping_items SET checked = $2 WHERE id = $1 RETURNING id", [id, checked]);
  return r.length > 0;
}

export async function removeShopping(id: number): Promise<boolean> {
  const r = await query<{ id: number }>(
    "DELETE FROM shopping_items WHERE id = $1 RETURNING id", [id]);
  return r.length > 0;
}

export async function clearCheckedShopping(): Promise<number> {
  const r = await query<{ id: number }>(
    "DELETE FROM shopping_items WHERE checked RETURNING id");
  return r.length;
}
