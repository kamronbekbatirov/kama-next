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

export type Slot = "breakfast" | "lunch" | "dinner" | "snack";
export const SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

export interface PlanRow {
  id: number; day: string; slot: Slot;
  dish_id: number | null; dish_name: string | null; kcal: number | null; note: string | null;
}

export interface Entry {
  id: number; day: string; slot: Slot | null; name: string;
  kcal: number | null; kcal_max: number | null;
  source: "manual" | "dish" | "photo" | "plan";
  dish_id: number | null; note: string | null;
}

export interface DayTotal { min: number; max: number; count: number }

export interface ShopItem {
  id: number; name: string; qty: string | null; checked: boolean; dish_id: number | null;
}
