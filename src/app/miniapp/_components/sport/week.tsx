"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { todayIn } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, Pill } from "../dashboard-ui";
import { haptic } from "@/lib/telegram-webapp";
import { sportApi } from "./api";
import type { Block } from "./types";
import { BLOCKS } from "./types";

/** ISO weekday for a local date string — Monday is 1, matching the table. */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/**
 * The training week, by weekday rather than by date.
 *
 * A training week repeats: "Monday is a gym day" stays true next month, so it
 * is set once here instead of being planned date by date forever. Today's pane
 * reads the same table, which is why the two never disagree.
 */
export function SportWeek({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const s = t.dash.sport;
  const { tz } = useTimezone();
  const today = isoWeekday(todayIn(tz));

  const [plan, setPlan] = useState<{ weekday: number; block: Block }[]>([]);

  const load = useCallback(() => {
    sportApi.week().then(r => { if (Array.isArray(r)) setPlan(r); }).catch(() => {});
  }, []);
  useEffect(load, [load, reloadKey]);

  const toggle = async (weekday: number, block: Block) => {
    const on = !plan.some(p => p.weekday === weekday && p.block === block);
    // Optimistic: a grid of toggles that waits for the network feels stuck.
    setPlan(p => on
      ? [...p, { weekday, block }]
      : p.filter(x => !(x.weekday === weekday && x.block === block)));
    if (on) haptic.tap();
    await sportApi.setWeekBlock(weekday, block, on);
    load(); onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow={s.week} />
      <div className="text-[10px] text-[var(--muted)] leading-snug -mt-1">{s.weekHint}</div>

      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map(wd => {
          const mine = plan.filter(p => p.weekday === wd).map(p => p.block);
          const isToday = wd === today;
          return (
            <Card key={wd} className={["p-3", isToday ? "ring-1 ring-[var(--foreground)]/20" : ""].join(" ")}>
              <div className="flex items-center gap-2 mb-2">
                <span className={[
                  "text-xs uppercase tracking-[0.16em] w-8 shrink-0",
                  isToday ? "font-bold" : "text-[var(--muted)]",
                ].join(" ")}>
                  {s.weekdays[wd - 1]}
                </span>
                {mine.length === 0 && (
                  <span className="text-[11px] text-[var(--muted)]">{s.restDay}</span>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {BLOCKS.map(b => (
                  <Pill
                    key={b} size="sm"
                    active={mine.includes(b)}
                    onClick={() => void toggle(wd, b)}
                  >
                    {s.blocks[b]}
                  </Pill>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
