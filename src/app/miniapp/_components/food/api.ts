import type { Dish, Entry, DayTotal, PlanRow, ShopItem, Slot } from "./types";

async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  return res.json();
}
const body = (method: string, b?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(b === undefined ? {} : { body: JSON.stringify(b) }),
});

const B = "/api/dashboard/food";

export const foodApi = {
  dishes: () => j<Dish[]>(`${B}/dishes`),
  // `items` is the input shape (no ids yet), which is why the payload type is
  // spelled out rather than reusing Dish — a Dish always carries item ids back.
  saveDish: (
    d: {
      name: string;
      kcal?: number | null; servings?: number | null; recipe?: string | null;
      notes?: string | null;
      items?: { name: string; qty?: string | null }[];
    },
    id?: number,
  ) =>
    j<Dish | { error: string }>(`${B}/dishes`, body(id ? "PATCH" : "POST", id ? { ...d, id } : d)),
  deleteDish: (id: number) =>
    j<{ ok: true } | { error: string }>(`${B}/dishes`, body("DELETE", { id, purge: true })),

  day: (day: string) => j<{ day: string; entries: Entry[]; total: DayTotal }>(`${B}/diary?day=${day}`),
  addEntry: (e: Record<string, unknown>) =>
    j<{ entry: Entry; total: DayTotal } | { error: string }>(`${B}/diary`, body("POST", e)),
  removeEntry: (id: number) => j<{ ok: true }>(`${B}/diary`, body("DELETE", { id })),

  plan: (from: string, to: string) => j<PlanRow[]>(`${B}/plan?from=${from}&to=${to}`),
  weekPlan: () => j<PlanRow[]>(`${B}/plan?week=1`),
  addWeekPlan: (weekday: number, slot: Slot, dish_id: number) =>
    j<{ ok: true } | { error: string }>(`${B}/plan`, body("POST", { weekday, slot, dish_id })),
  addPlan: (day: string, slot: Slot, dish_id: number) =>
    j<{ id: number } | { error: string }>(`${B}/plan`, body("POST", { day, slot, dish_id })),
  removePlan: (id: number) => j<{ ok: true }>(`${B}/plan`, body("DELETE", { id })),

  shopping: () => j<ShopItem[]>(`${B}/shopping`),
  addShopping: (name: string, qty?: string) =>
    j<ShopItem | { error: string }>(`${B}/shopping`, body("POST", { name, qty })),
  shopFromDish: (from_dish: number) =>
    j<{ ok: true; added: number }>(`${B}/shopping`, body("POST", { from_dish })),
  checkShopping: (id: number, checked: boolean) =>
    j<{ ok: true }>(`${B}/shopping`, body("PATCH", { id, checked })),
  removeShopping: (id: number) => j<{ ok: true }>(`${B}/shopping`, body("DELETE", { id })),
  clearChecked: () => j<{ ok: true; removed: number }>(`${B}/shopping`, body("DELETE", { clear_checked: true })),
};

/** "650" or "400–550" — a range is shown as a range, never averaged away. */
export function fmtKcal(min: number | null, max?: number | null): string {
  if (min === null || min === undefined) return "—";
  return max && max !== min ? `${min}–${max}` : String(min);
}
