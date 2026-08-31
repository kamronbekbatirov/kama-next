import type Anthropic from "@anthropic-ai/sdk";
import {
  listDishes, upsertDish, deleteDish, getPlan, addToPlan, removeFromPlan,
  getDay, addEntry, removeEntry, dayTotal,
  listShopping, addShopping, addDishToShopping, setShoppingChecked, clearCheckedShopping,
} from "@/lib/food";
import { isoToday } from "@/lib/timezone";

/**
 * Food tools — owner only, appended to the owner's set like the tracker's.
 *
 * The calorie tools take a range, not a number. When the assistant has looked
 * at a photo it knows what is on the plate and not what went into the pan, and
 * a single figure would present a guess as a measurement. `kcal_max` is how it
 * says "somewhere between".
 */
export const FOOD_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_dishes",
    description: "His recipe book: every dish with its calories and ingredients.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "save_dish",
    description:
      "Create a dish, or update one by passing its id. `items` replaces the ingredient list wholesale, so send the whole list when changing it.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Omit to create." },
        name: { type: "string" },
        kcal: { type: "integer", description: "Per serving." },
        servings: { type: "number" },
        recipe: { type: "string", description: "How to cook it." },
        items: {
          type: "array",
          description: "Ingredients — these are what the shopping list is built from.",
          items: {
            type: "object",
            properties: { name: { type: "string" }, qty: { type: "string" } },
            required: ["name"],
          },
        },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_dish",
    description: "Delete a dish from the book permanently.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "food_day",
    description: "What he ate on a day, with the running total as a range.",
    input_schema: {
      type: "object",
      properties: { day: { type: "string", description: "ISO date. Default today." } },
    },
  },
  {
    name: "log_food",
    description:
      "Record something eaten. Give kcal alone when the figure is known (a dish from the book, a label). Give kcal AND kcal_max when it is an estimate — from a photo, or from a description — because a photo cannot show oil or portion weight and one number would claim precision you do not have. Say the range back to him and let him correct it.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kcal: { type: "integer", description: "The figure, or the low end of a range." },
        kcal_max: { type: "integer", description: "High end. Only for estimates." },
        slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        day: { type: "string", description: "ISO date. Default today." },
        note: { type: "string", description: "What you assumed, if this is an estimate." },
        from_photo: {
          type: "boolean",
          description: "True only when the number came from looking at a photograph he sent.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "remove_food_entry",
    description: "Remove one logged item from a day.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "food_plan",
    description: "The meal plan between two dates — what he intends to cook.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date. Default today." },
        to: { type: "string", description: "ISO date. Default same as from." },
      },
    },
  },
  {
    name: "plan_meal",
    description: "Put a dish from the book into the plan for a day and slot.",
    input_schema: {
      type: "object",
      properties: {
        day: { type: "string", description: "ISO date. Default today." },
        slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        dish_id: { type: "integer" },
      },
      required: ["slot", "dish_id"],
    },
  },
  {
    name: "unplan_meal",
    description: "Take a planned meal back out of the plan.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "shopping_list",
    description: "The shopping list as it stands.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_to_shopping",
    description:
      "Add a product by name, or every ingredient of a dish at once with from_dish. Ingredients already on the list and unticked are skipped.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        qty: { type: "string" },
        from_dish: { type: "integer", description: "A dish id — adds all its ingredients." },
      },
    },
  },
  {
    name: "check_shopping_item",
    description: "Tick a product off the list, or untick it with checked=false.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" }, checked: { type: "boolean" } },
      required: ["id"],
    },
  },
  {
    name: "clear_checked_shopping",
    description: "Remove everything already ticked off the shopping list.",
    input_schema: { type: "object", properties: {} },
  },
];

export const FOOD_TOOL_NAMES = new Set(FOOD_TOOL_DEFINITIONS.map(t => t.name));

type Input = Record<string, unknown>;
const asStr = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const asInt = (v: unknown) => {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isInteger(n) ? n : null;
};
const kcalRange = (min: number | null, max: number | null) =>
  max && max !== min ? `${min}–${max}` : String(min ?? "—");

export async function executeFoodTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case "list_dishes": {
      const rows = await listDishes();
      if (rows.length === 0) return "The recipe book is empty.";
      return rows.map(d =>
        `#${d.id} ${d.name} — ${d.kcal ?? "?"} kcal/serving` +
        (d.items.length ? `; ingredients: ${d.items.map(i => `${i.name}${i.qty ? ` (${i.qty})` : ""}`).join(", ")}` : "")
      ).join("\n");
    }

    case "save_dish": {
      const dishName = asStr(input.name);
      if (!dishName) return "Error: name required";
      const items = Array.isArray(input.items)
        ? (input.items as { name?: string; qty?: string }[])
            .map(i => ({ name: String(i?.name ?? ""), qty: i?.qty ?? null }))
            .filter(i => i.name.trim())
        : undefined;
      const dish = await upsertDish({
        name: dishName,
        kcal: asInt(input.kcal),
        servings: typeof input.servings === "number" ? input.servings : null,
        recipe: asStr(input.recipe),
        items,
      }, asInt(input.id) ?? undefined);
      return dish
        ? `Saved dish #${dish.id}: ${dish.name} — ${dish.kcal ?? "?"} kcal, ${dish.items.length} ingredient(s).`
        : "Error: could not save";
    }

    case "delete_dish": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      return (await deleteDish(id)) ? `Dish #${id} deleted.` : `Error: no dish #${id}`;
    }

    case "food_day": {
      const day = asStr(input.day) ?? await isoToday();
      const [entries, total] = await Promise.all([getDay(day), dayTotal(day)]);
      if (entries.length === 0) return `${day}: nothing logged.`;
      const lines = entries.map(e =>
        `#${e.id} [${e.slot ?? "-"}] ${e.name} — ${kcalRange(e.kcal, e.kcal_max)} kcal (${e.source})`);
      return `${day}\n${lines.join("\n")}\nTotal: ${kcalRange(total.min, total.max)} kcal`;
    }

    case "log_food": {
      const n = asStr(input.name);
      if (!n) return "Error: name required";
      const day = asStr(input.day) ?? await isoToday();
      const lo = asInt(input.kcal);
      const hi = asInt(input.kcal_max);
      const entry = await addEntry({
        day, name: n, slot: asStr(input.slot),
        kcal: lo, kcal_max: hi && lo && hi > lo ? hi : null,
        // The range is what marks an estimate; the source records where it came
        // from. Conflating the two labelled a typed guess as a photograph.
        source: input.from_photo === true ? "photo" : "manual",
        note: asStr(input.note),
      });
      if (!entry) return "Error: could not log";
      const total = await dayTotal(day);
      return `Logged: ${entry.name} — ${kcalRange(entry.kcal, entry.kcal_max)} kcal. ` +
             `Day total ${kcalRange(total.min, total.max)} kcal.`;
    }

    case "remove_food_entry": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      return (await removeEntry(id)) ? `Entry #${id} removed.` : `Error: no entry #${id}`;
    }

    case "food_plan": {
      const from = asStr(input.from) ?? await isoToday();
      const to = asStr(input.to) ?? from;
      const rows = await getPlan(from, to);
      if (rows.length === 0) return `Nothing planned between ${from} and ${to}.`;
      return rows.map(r => `#${r.id} ${r.day} ${r.slot}: ${r.dish_name ?? r.note} (${r.kcal ?? "?"} kcal)`).join("\n");
    }

    case "plan_meal": {
      const slot = asStr(input.slot);
      const dishId = asInt(input.dish_id);
      if (!slot || !dishId) return "Error: slot and dish_id required";
      const day = asStr(input.day) ?? await isoToday();
      const row = await addToPlan(day, slot, dishId);
      return row ? `Planned for ${day} ${slot}.` : "Error: could not plan";
    }

    case "unplan_meal": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      return (await removeFromPlan(id)) ? `Removed from the plan.` : `Error: no plan row #${id}`;
    }

    case "shopping_list": {
      const rows = await listShopping();
      if (rows.length === 0) return "The shopping list is empty.";
      return rows.map(i => `#${i.id} [${i.checked ? "x" : " "}] ${i.name}${i.qty ? ` — ${i.qty}` : ""}`).join("\n");
    }

    case "add_to_shopping": {
      const fromDish = asInt(input.from_dish);
      if (fromDish) {
        const added = await addDishToShopping(fromDish);
        return `${added} ingredient(s) added from dish #${fromDish}.`;
      }
      const n = asStr(input.name);
      if (!n) return "Error: name or from_dish required";
      const row = await addShopping(n, asStr(input.qty));
      return row ? `Added: ${row.name}${row.qty ? ` (${row.qty})` : ""}` : "Error: could not add";
    }

    case "check_shopping_item": {
      const id = asInt(input.id);
      if (!id) return "Error: id required";
      const checked = input.checked === undefined ? true : !!input.checked;
      const ok = await setShoppingChecked(id, checked);
      return ok ? `#${id} ${checked ? "ticked" : "unticked"}.` : `Error: no item #${id}`;
    }

    case "clear_checked_shopping":
      return `${await clearCheckedShopping()} ticked item(s) removed.`;

    default:
      return `Error: unknown tool "${name}"`;
  }
}
