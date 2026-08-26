"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { haptic, tgConfirm } from "@/lib/telegram-webapp";
import { trackerApi } from "./api";
import type { GoalStep } from "./types";

/**
 * Optional milestones on a goal.
 *
 * The goal is still a countable target plus an if-then plan — that is what
 * makes a habit stick and none of it is negotiable. Steps are for the goals
 * that also have a destination: "read 20 pages a day" needs none, "English to
 * B2" does. A goal with no steps shows nothing at all.
 *
 * Ticking one is not a check-in. Check-ins are the daily behaviour; steps are
 * the distance covered. Both are shown to the group, because progress others
 * can see is the mechanism this whole feature is built on.
 */
export function GoalSteps({ goalId, onChanged }: { goalId: number; onChanged: () => void }) {
  const { t } = useLang();
  const x = t.dash.tracker;
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    trackerApi.steps(goalId).then(r => { if (Array.isArray(r)) setSteps(r); }).catch(() => {});
  }, [goalId]);
  useEffect(load, [load]);

  const add = async () => {
    const v = title.trim();
    if (!v || busy) return;
    setBusy(true);
    await trackerApi.addStep(goalId, v);
    setTitle("");
    setBusy(false);
    load();
    onChanged();
  };

  const toggle = async (s: GoalStep) => {
    const done = !s.done_at;
    // Optimistic: a checkbox that waits for the network feels broken.
    setSteps(prev => prev.map(p => p.id === s.id ? { ...p, done_at: done ? "now" : null } : p));
    if (done) haptic.success();
    await trackerApi.setStepDone(s.id, done);
    load();
    onChanged();
  };

  const remove = async (s: GoalStep) => {
    if (!(await tgConfirm(x.stepRemoveConfirm.replace("{name}", s.title)))) return;
    await trackerApi.removeStep(s.id);
    load();
    onChanged();
  };

  const done = steps.filter(s => s.done_at).length;

  return (
    <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">{x.steps}</span>
        {steps.length > 0 && (
          <span className="text-[10px] tabular-nums text-[var(--muted)]">{done}/{steps.length}</span>
        )}
        <button
          onClick={() => setAdding(v => !v)}
          className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
        >
          <Plus className="h-3 w-3" /> {x.stepAdd}
        </button>
      </div>

      {steps.length === 0 && !adding && (
        <div className="text-[10px] text-[var(--muted)] leading-snug">{x.stepsHint}</div>
      )}

      <div className="flex flex-col gap-0.5">
        {steps.map(s => (
          <div key={s.id} className="flex items-center gap-2 group">
            <button
              onClick={() => void toggle(s)}
              aria-label={s.title}
              className={[
                "h-4 w-4 shrink-0 rounded-md border grid place-items-center transition-all cursor-pointer",
                s.done_at
                  ? "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--card-border)] hover:border-[var(--foreground)]/40",
              ].join(" ")}
            >
              {s.done_at && <Check className="h-2.5 w-2.5" />}
            </button>
            <span className={[
              "text-xs flex-1 min-w-0 truncate",
              s.done_at ? "line-through text-[var(--muted)]" : "",
            ].join(" ")}>
              {s.title}
            </span>
            <button
              onClick={() => void remove(s)}
              aria-label="remove"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--muted)] hover:text-red-500 transition-all cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div className="flex items-center gap-2 mt-1.5">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void add(); }}
            placeholder={x.stepPh}
            className="h-8 text-xs"
          />
          <button
            onClick={() => void add()}
            disabled={!title.trim() || busy}
            className="h-8 px-3 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-[11px] font-semibold disabled:opacity-40 cursor-pointer"
          >
            {x.stepAdd}
          </button>
        </div>
      )}
    </div>
  );
}
