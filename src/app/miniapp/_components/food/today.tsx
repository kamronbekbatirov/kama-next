"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Camera } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { todayIn } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, EmptyState, Pill } from "../dashboard-ui";
import { haptic, tgConfirm } from "@/lib/telegram-webapp";
import { foodApi, fmtKcal } from "./api";
import type { Entry, DayTotal, PlanRow, Slot } from "./types";
import { SLOTS } from "./types";
import { PhotoEstimate } from "./photo";

/**
 * The day's intake, and the calculator that adds to it.
 *
 * Three ways in, in the order they cost effort: what was already planned (one
 * tap), typed by hand, or estimated from a photo. The planned meals are listed
 * separately rather than counted automatically — a plan is an intention, and
 * counting calories you have not eaten yet would make the number useless.
 */
export function FoodToday({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const f = t.dash.food;
  const { tz } = useTimezone();
  const day = todayIn(tz);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState<DayTotal>({ min: 0, max: 0, count: 0 });
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [slot, setSlot] = useState<Slot>("lunch");
  const [photoOpen, setPhotoOpen] = useState(false);

  const load = useCallback(() => {
    foodApi.day(day).then(d => {
      if (!d || !Array.isArray(d.entries)) return;
      setEntries(d.entries);
      setTotal(d.total);
    }).catch(() => {});
    foodApi.plan(day, day).then(p => { if (Array.isArray(p)) setPlan(p); }).catch(() => {});
  }, [day]);
  useEffect(load, [load, reloadKey]);

  const add = async (e: Record<string, unknown>) => {
    await foodApi.addEntry({ day, ...e });
    haptic.success();
    setName(""); setKcal("");
    load(); onChanged();
  };

  const remove = async (en: Entry) => {
    if (!(await tgConfirm(`${f.remove}: ${en.name}?`))) return;
    await foodApi.removeEntry(en.id);
    load(); onChanged();
  };

  const manual = () => {
    const n = name.trim();
    if (!n) return;
    const k = kcal.trim() ? Math.round(Number(kcal)) : null;
    void add({ name: n, slot, kcal: Number.isFinite(k) ? k : null, source: "manual" });
  };

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionHeader
          eyebrow={f.total}
          trailing={
            <span className="text-xs tabular-nums font-semibold">
              {fmtKcal(total.min, total.max)} <span className="text-[var(--muted)]">{f.kcal}</span>
            </span>
          }
        />
        <Card className="p-2">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-[var(--muted)]">{f.noEntries}</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {entries.map(e => (
                <div key={e.id} className="flex items-center gap-3 py-2 px-2 rounded-xl">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] w-16 shrink-0">
                    {e.slot ? f.slots[e.slot] : ""}
                  </span>
                  <span className="text-sm flex-1 min-w-0 truncate">{e.name}</span>
                  <span className="text-xs tabular-nums shrink-0">
                    {fmtKcal(e.kcal, e.kcal_max)}
                    {e.kcal_max && e.kcal_max !== e.kcal && (
                      <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--muted)]">
                        {f.estimate}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => void remove(e)}
                    aria-label={f.remove}
                    className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {plan.length > 0 && (
        <section>
          <SectionHeader eyebrow={f.fromPlan} />
          <Card className="p-2">
            <div className="flex flex-col gap-0.5">
              {plan.filter(p => p.dish_name).map(p => (
                <div key={p.id} className="flex items-center gap-3 py-2 px-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] w-16 shrink-0">
                    {f.slots[p.slot]}
                  </span>
                  <span className="text-sm flex-1 min-w-0 truncate">{p.dish_name}</span>
                  <span className="text-xs tabular-nums text-[var(--muted)] shrink-0">
                    {p.kcal ?? "—"}
                  </span>
                  <button
                    onClick={() => void add({
                      name: p.dish_name, slot: p.slot, kcal: p.kcal,
                      source: "plan", dish_id: p.dish_id,
                    })}
                    className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer shrink-0"
                  >
                    {f.logPlanned}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader eyebrow={f.addManual} />
        <Card className="p-3">
          <div className="flex gap-1.5 flex-wrap mb-2">
            {SLOTS.map(s => (
              <Pill key={s} size="sm" active={slot === s} onClick={() => setSlot(s)}>
                {f.slots[s]}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") manual(); }}
              placeholder={f.namePh} className="flex-1 min-w-0 h-9 text-sm"
            />
            <Input
              type="number" inputMode="numeric" value={kcal}
              onChange={e => setKcal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") manual(); }}
              placeholder={f.kcalPh} className="w-20 h-9 text-sm tabular-nums"
            />
            <button
              onClick={manual} disabled={!name.trim()}
              className="h-9 px-3 shrink-0 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setPhotoOpen(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" /> {f.addPhoto}
          </button>
        </Card>
      </section>

      {photoOpen && (
        <PhotoEstimate
          day={day}
          onClose={() => setPhotoOpen(false)}
          onSaved={() => { setPhotoOpen(false); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

export { EmptyState };
