"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { todayIn, shiftDate, fmtDay, localeOf } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, Pill } from "../dashboard-ui";
import { haptic } from "@/lib/telegram-webapp";
import { foodApi } from "./api";
import type { Dish, PlanRow, Slot } from "./types";
import { SLOTS } from "./types";

/** The week ahead: what to cook, and what it will cost in calories. */
export function FoodPlan({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t, lang } = useLang();
  const f = t.dash.food;
  const { tz } = useTimezone();
  const today = todayIn(tz);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i));

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [picking, setPicking] = useState<{ day: string; slot: Slot } | null>(null);

  const load = useCallback(() => {
    foodApi.plan(days[0], days[6]).then(r => { if (Array.isArray(r)) setRows(r); }).catch(() => {});
    foodApi.dishes().then(d => { if (Array.isArray(d)) setDishes(d); }).catch(() => {});
    // days is derived from `today`, which only changes when the day does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);
  useEffect(load, [load, reloadKey]);

  const put = async (day: string, slot: Slot, dishId: number) => {
    await foodApi.addPlan(day, slot, dishId);
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
      {days.map(d => {
        const forDay = rows.filter(r => r.day === d);
        const kcal = forDay.reduce((a, r) => a + (r.kcal ?? 0), 0);
        return (
          <section key={d}>
            <SectionHeader
              eyebrow={d === today ? f.today : fmtDay(d, localeOf(lang), { weekday: "short", day: "numeric", month: "short" })}
              trailing={kcal > 0 ? (
                <span className="text-[11px] tabular-nums text-[var(--muted)]">{kcal} {f.kcal}</span>
              ) : undefined}
            />
            <Card className="p-2">
              <div className="flex flex-col gap-0.5">
                {SLOTS.map(slot => {
                  const here = forDay.filter(r => r.slot === slot);
                  return (
                    <div key={slot} className="flex items-center gap-3 py-1.5 px-2">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] w-16 shrink-0">
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
                        {here.length === 0 && (
                          <span className="text-[11px] text-[var(--card-border)]">—</span>
                        )}
                      </div>
                      <button
                        onClick={() => setPicking({ day: d, slot })}
                        aria-label={f.planAdd}
                        className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        );
      })}

      {picking && (
        <Card className="p-3 sticky bottom-2 shadow-pop">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
            {f.slots[picking.slot]} · {picking.day === today ? f.today : picking.day}
          </div>
          <div className="flex gap-1.5 flex-wrap max-h-40 overflow-y-auto">
            {dishes.map(d => (
              <Pill key={d.id} size="sm" onClick={() => void put(picking.day, picking.slot, d.id)}>
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
