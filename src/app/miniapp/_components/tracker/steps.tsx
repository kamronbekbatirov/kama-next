"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { haptic, tgConfirm } from "@/lib/telegram-webapp";
import { trackerApi } from "./api";
import type { GoalStep } from "./types";

/**
 * What you committed to this week, on a goal that outlasts the week.
 *
 * A goal can be long — "English to B1" — while what you actually promise
 * yourself changes every Monday. So steps carry the week they were set in:
 * this week's are in front of you, earlier weeks fold away but stay readable
 * and deletable instead of disappearing.
 *
 * Ticking one is not a check-in. A check-in is the daily behaviour; a step is
 * distance covered.
 */
export function GoalSteps({ goalId, onChanged }: { goalId: number; onChanged: () => void }) {
  const { t, lang } = useLang();
  const x = t.dash.tracker;
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [thisWeek, setThisWeek] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    // `showPast` swaps the whole list for every week at once, so opening the
    // history is one request rather than one per week.
    trackerApi.steps(goalId, showPast)
      .then(r => {
        if (!r || !Array.isArray(r.steps)) return;
        setSteps(r.steps);
        setWeeks(r.weeks ?? []);
        setThisWeek(r.week ?? null);
      })
      .catch(() => {});
  }, [goalId, showPast]);
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

  const fmtWeek = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(
      lang === "en" ? "en-GB" : lang === "uz" ? "uz-UZ" : "ru-RU",
      { day: "numeric", month: "short" },
    );

  const done = steps.filter(s => s.done_at).length;
  const pastCount = weeks.filter(w => w !== thisWeek).length;

  return (
    <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
          {showPast ? x.steps : x.thisWeek}
        </span>
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
        <div className="text-[10px] text-[var(--muted)] leading-snug">
          {weeks.length > 0 ? x.noStepsThisWeek : x.stepsHint}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {steps.map((s, i) => {
          // A week heading appears only where the week actually changes, so a
          // single week's list stays a plain list.
          const prev = steps[i - 1];
          const showHeading = showPast && s.week_start && s.week_start !== prev?.week_start;
          return (
            <div key={s.id}>
              {showHeading && (
                <div className="text-[10px] text-[var(--muted)] mt-2 mb-0.5">
                  {s.week_start === thisWeek
                    ? x.thisWeek
                    : x.weekOf.replace("{d}", fmtWeek(s.week_start!))}
                </div>
              )}
              <div className="flex items-center gap-2">
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
                {/* Always visible: this used to appear on hover, which on a
                    phone means never. */}
                <button
                  onClick={() => void remove(s)}
                  aria-label="remove"
                  className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-red-500 transition-colors cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pastCount > 0 && (
        <button
          onClick={() => setShowPast(v => !v)}
          className="mt-2 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] underline underline-offset-4 cursor-pointer"
        >
          {showPast ? x.thisWeek : x.pastWeeks.replace("{n}", String(pastCount))}
        </button>
      )}

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
