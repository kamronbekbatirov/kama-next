"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import { haptic, useTelegramBack } from "@/lib/telegram-webapp";

export interface DaySummary {
  date: string;
  todos: { id: number; text: string }[];
  habits: string[];
  workout: { kind: string; sets: { name: string; set_no: number; reps: number | null;
                                  weight_kg: number | null; seconds: number | null }[] } | null;
  food: { entries: { name: string; kcal: number | null; kcal_max: number | null }[];
          total: { min: number; max: number } };
}

const fmtSet = (s: { reps: number | null; weight_kg: number | null; seconds: number | null }) =>
  s.weight_kg ? `${s.weight_kg} × ${s.reps ?? "?"}` : s.seconds ? `${s.seconds} сек` : String(s.reps ?? "—");

/**
 * Close the day: see what is about to be recorded, then record it.
 *
 * The reflection fields still save themselves as they are typed — losing a
 * half-written thought to a missed tap would be worse than any confirmation
 * step. What this adds is the other half: the tasks finished, the session
 * trained and what was eaten, gathered from where they actually live and
 * attached to the day only once he has looked at them.
 */
export function CloseDay({ date, onClose, onSaved }: {
  date: string;
  onClose: () => void;
  onSaved: (summary: DaySummary) => Promise<void> | void;
}) {
  const { t } = useLang();
  const d = t.dash.log;
  const [data, setData] = useState<DaySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useTelegramBack(true, onClose);

  useEffect(() => {
    fetch(`/api/dashboard/log/summary?date=${date}`)
      .then(r => r.json())
      .then(s => { if (s && !s.error) setData(s); else setErr(true); })
      .catch(() => setErr(true));
  }, [date]);

  const confirm = async () => {
    if (!data || busy) return;
    setBusy(true);
    await onSaved(data);
    haptic.success();
    setBusy(false);
  };

  const nothing = <span className="text-[var(--muted)]">—</span>;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-1">{label}</div>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.closeDay}</DialogTitle>
          <p className="text-[11px] text-[var(--muted)] mt-1.5">{d.closeDayHint}</p>
        </DialogHeader>

        {err && <div className="text-[11px] text-red-500">—</div>}
        {!data && !err && <div className="py-6 text-center text-xs text-[var(--muted)]">…</div>}

        {data && (
          <div className="flex flex-col gap-3.5">
            <Row label={d.doneTasks}>
              {data.todos.length === 0 ? nothing : (
                <ul className="flex flex-col gap-0.5">
                  {data.todos.map(x => <li key={x.id}>· {x.text}</li>)}
                </ul>
              )}
            </Row>

            <Row label={d.doneHabits}>
              {data.habits.length === 0 ? nothing : data.habits.join(", ")}
            </Row>

            <Row label={d.doneWorkout}>
              {!data.workout || data.workout.sets.length === 0 ? nothing : (
                <ul className="flex flex-col gap-0.5">
                  {data.workout.sets.map((s, i) => (
                    <li key={i} className="tabular-nums">· {s.name} — {fmtSet(s)}</li>
                  ))}
                </ul>
              )}
            </Row>

            <Row label={d.doneFood}>
              {data.food.entries.length === 0 ? nothing : (
                <>
                  <ul className="flex flex-col gap-0.5">
                    {data.food.entries.map((e, i) => (
                      <li key={i} className="tabular-nums">
                        · {e.name} — {e.kcal_max && e.kcal_max !== e.kcal
                          ? `${e.kcal}–${e.kcal_max}` : e.kcal ?? "?"}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 tabular-nums font-semibold">
                    {data.food.total.min === data.food.total.max
                      ? data.food.total.min
                      : `${data.food.total.min}–${data.food.total.max}`} ккал
                  </div>
                </>
              )}
            </Row>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{d.closeCancel}</Button>
          <Button onClick={() => void confirm()} disabled={!data || busy}>{d.confirmSave}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
