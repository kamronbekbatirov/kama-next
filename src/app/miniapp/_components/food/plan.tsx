"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { todayIn } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, Pill } from "../dashboard-ui";
import { haptic } from "@/lib/telegram-webapp";
import { foodApi } from "./api";
import type { Dish, PlanRow, Slot } from "./types";
import { SLOTS } from "./types";

/** ISO weekday for a local date — Monday is 1. */
function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/**
 * The meal plan, by weekday rather than by date.
 *
 * A plan is a routine — "Monday is oats" stays true next month — so planning it
 * date by date would mean retyping the same week forever. Today's column is
 * marked, and the day's pane reads the same rows, so the two cannot disagree.
 */
export function FoodPlan({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const f = t.dash.food;
  const s = t.dash.sport;
  const { tz } = useTimezone();
  const today = isoWeekday(todayIn(tz));

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [picking, setPicking] = useState<{ weekday: number; slot: Slot } | null>(null);

  const load = useCallback(() => {
    foodApi.weekPlan().then(r => { if (Array.isArray(r)) setRows(r); }).catch(() => {});
    foodApi.dishes().then(d => { if (Array.isArray(d)) setDishes(d); }).catch(() => {});
  }, []);
  useEffect(load, [load, reloadKey]);

  const put = async (weekday: number, slot: Slot, dishId: number) => {
    await foodApi.addWeekPlan(weekday, slot, dishId);
    haptic.success();
    setPicking(null);
    load(); onChanged();
  };

  const drop = async (id: number) => {
    await foodApi.removePlan(id);
    load(); onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow={f.tabs.plan} />
      <div className="text-[10px] text-[var(--muted)] leading-snug -mt-1">{s.weekHint}</div>

      {[1, 2, 3, 4, 5, 6, 7].map(wd => {
        const forDay = rows.filter(r => r.weekday === wd);
        const kcal = forDay.reduce((a, r) => a + (r.kcal ?? 0), 0);
        const isToday = wd === today;
        return (
          <Card key={wd} className={["p-2", isToday ? "ring-1 ring-[var(--foreground)]/20" : ""].join(" ")}>
            <div className="flex items-center gap-2 px-2 py-1">
              <span className={[
                "text-xs uppercase tracking-[0.16em] w-8 shrink-0",
                isToday ? "font-bold" : "text-[var(--muted)]",
              ].join(" ")}>
                {s.weekdays[wd - 1]}
              </span>
              {kcal > 0 && (
                <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]">
                  {kcal} {f.kcal}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5">
              {SLOTS.map(slot => {
                const here = forDay.filter(r => r.slot === slot);
                return (
                  <div key={slot} className="flex items-start gap-3 py-1.5 px-2">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] w-16 shrink-0 pt-0.5">
                      {f.slots[slot]}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                      {here.map(r => (
                        <span key={r.id}
                          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-[var(--surface-2)]">
                          {r.dish_name ?? r.note}
                          <button onClick={() => void drop(r.id)} aria-label="remove"
                            className="text-[var(--muted)] hover:text-red-500 cursor-pointer">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {here.length === 0 && <span className="text-[11px] text-[var(--card-border)]">—</span>}
                    </div>
                    <button onClick={() => setPicking({ weekday: wd, slot })} aria-label={f.planAdd}
                      className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {picking && (
        <Card className="p-3 sticky bottom-2 shadow-pop">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
            {s.weekdays[picking.weekday - 1]} · {f.slots[picking.slot]}
          </div>
          <div className="flex gap-1.5 flex-wrap max-h-40 overflow-y-auto">
            {dishes.map(d => (
              <Pill key={d.id} size="sm" onClick={() => void put(picking.weekday, picking.slot, d.id)}>
                {d.name}
              </Pill>
            ))}
          </div>
          <button onClick={() => setPicking(null)}
            className="mt-2 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
            {f.cancel}
          </button>
        </Card>
      )}
    </div>
  );
}
