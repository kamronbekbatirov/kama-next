"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Target, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { todayIn, shiftDate } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, EmptyState, IconButton } from "../dashboard-ui";
import { trackerApi } from "./api";
import type { CheckIn, Goal } from "./types";

/** 14 days of dots. A miss is an empty dot, never a cross — see group.tsx. */
function DotStrip({ days, done }: { days: string[]; done: Set<string> }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {days.map(d => (
        <span
          key={d}
          title={d}
          className={[
            "h-2.5 flex-1 rounded-full",
            done.has(d) ? "bg-[var(--foreground)]" : "bg-[var(--muted-bg)]",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function GoalCard({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const { t } = useLang();
  const x = t.dash.tracker;
  const { tz } = useTimezone();
  const today = todayIn(tz);
  const days = Array.from({ length: 14 }, (_, i) => shiftDate(today, -(13 - i)));

  const extras = (goal.extras ?? {}) as {
    woop_outcome?: string; woop_obstacle?: string; stake?: string;
  };
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    trackerApi.checkIns(goal.id, days[0], today).then(r => {
      if (Array.isArray(r)) setCheckins(r);
    });
    // `days` is derived from `today`, which is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.id, today]);
  useEffect(() => { load(); }, [load]);

  const done = new Set(checkins.filter(c => c.value > 0).map(c => c.day));
  const todayEntry = checkins.find(c => c.day === today);

  const log = async () => {
    setBusy(true);
    const v = value.trim() ? Number(value) : goal.target_value;
    await trackerApi.checkIn(goal.id, today, Number.isFinite(v) && v >= 0 ? v : goal.target_value);
    setValue("");
    setBusy(false);
    load();
    onChanged();
  };
  const undo = async () => {
    setBusy(true);
    await trackerApi.undoCheckIn(goal.id, today);
    setBusy(false);
    load();
    onChanged();
  };
  const setRemind = async (at: string | null) => {
    await trackerApi.setReminder(goal.id, at);
    onChanged();
  };
  const archive = async () => {
    if (!confirm(x.archiveConfirm)) return;
    await trackerApi.archiveGoal(goal.id);
    onChanged();
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{goal.title}</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            {goal.target_value} {goal.metric_unit} / {goal.period === "week" ? x.fPeriodWeek : x.fPeriodDay}
          </div>
        </div>
        <IconButton size="sm" variant="ghost" onClick={archive} aria-label={x.archive} title={x.archive}>
          <Archive className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {/* The if-then plan is shown, not filed away: re-reading it is the point. */}
      <div className="mt-2 text-[11px] leading-relaxed text-[var(--muted)] bg-[var(--surface-2)] rounded-xl px-3 py-2">
        <span className="font-semibold">{x.fCue}</span> {goal.cue_when}
        <br />
        <span className="font-semibold">{x.fAction}</span> {goal.action_then}
      </div>

      {/* An obstacle you wrote down and never see again is just a note. It is
          shown next to the plan because that is when it is useful. */}
      {(extras.woop_obstacle || extras.stake) && (
        <div className="mt-1.5 flex flex-col gap-1 text-[11px] leading-relaxed text-[var(--muted)] px-1">
          {extras.woop_obstacle && (
            <div><span className="font-semibold">{x.fObstacle}:</span> {extras.woop_obstacle}</div>
          )}
          {extras.stake && (
            <div><span className="font-semibold">{x.fStake}:</span> {extras.stake}</div>
          )}
        </div>
      )}

      <DotStrip days={days} done={done} />

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--card-border)]">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">{x.remindAt}</span>
        <input
          type="time"
          value={goal.remind_at ?? ""}
          onChange={e => { void setRemind(e.target.value || null); }}
          className="h-8 px-2 rounded-lg bg-[var(--muted-bg)] border border-[var(--input-border)] text-xs tabular-nums"
          aria-label={x.remindAt}
        />
        {goal.remind_at && (
          <button
            onClick={() => { void setRemind(null); }}
            className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] underline underline-offset-4 cursor-pointer"
          >
            {x.remindOff}
          </button>
        )}
      </div>
      <div className="text-[10px] text-[var(--muted)] mt-1 leading-snug">{x.remindHint}</div>

      <div className="flex items-center gap-2 mt-3">
        {todayEntry ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
              <Check className="h-4 w-4" /> {x.logged}
              <span className="tabular-nums text-[var(--muted)] font-normal">
                {todayEntry.value} {goal.metric_unit}
              </span>
            </span>
            <button
              onClick={() => void undo()}
              disabled={busy}
              className="ml-auto text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] underline underline-offset-4 cursor-pointer"
            >
              {x.undo}
            </button>
          </>
        ) : (
          <>
            <Input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={String(goal.target_value)}
              className="h-9 w-24 text-sm tabular-nums"
              aria-label={x.valuePh}
            />
            <span className="text-[11px] text-[var(--muted)]">{goal.metric_unit}</span>
            <button
              onClick={() => void log()}
              disabled={busy}
              className="ml-auto h-9 px-4 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {x.logToday}
            </button>
          </>
        )}
      </div>
    </Card>
  );
}

export function MinePane({ onNew, reloadKey, onChanged }: {
  onNew: () => void;
  reloadKey: number;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const x = t.dash.tracker;
  const [goals, setGoals] = useState<Goal[] | null>(null);

  const load = useCallback(() => {
    trackerApi.listGoals().then(r => setGoals(Array.isArray(r) ? r : []));
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  if (!goals) return <div className="py-10 text-center text-xs text-[var(--muted)]">…</div>;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        eyebrow={x.mineTitle}
        trailing={
          <IconButton size="sm" variant="outline" onClick={onNew} aria-label={x.tabs.new} title={x.tabs.new}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </IconButton>
        }
      />
      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="h-8 w-8" />}
            title={x.mineEmpty}
            action={
              <button
                onClick={onNew}
                className="h-10 px-4 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold cursor-pointer"
              >
                {x.addFirst}
              </button>
            }
          />
        </Card>
      ) : (
        goals.map(g => (
          <GoalCard key={g.id} goal={g} onChanged={() => { load(); onChanged(); }} />
        ))
      )}
      <div className="text-[10px] text-center text-[var(--muted)] px-6 leading-relaxed">
        {x.missedOk}
      </div>
    </div>
  );
}
