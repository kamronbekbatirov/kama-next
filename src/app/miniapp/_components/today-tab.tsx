"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, X, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useLang } from "@/components/providers";
import {
  api, jPost, jPatch, jDel, today, fmtMin, parseTime,
  PRAYER_IDS,
  type HabitsRow, type ScheduleBlock, type HabitDef,
} from "./_shared";
import { SectionHeader, Pill, IconButton } from "./dashboard-ui";
import { ScheduleIcon } from "./schedule-icon";
import { useTimezone, clockParts, dateLabel } from "./timezone";
import { SCHEDULE_ICON_KEYS, DEFAULT_ICON_KEY } from "@/lib/schedule-icons";

interface ScheduleRow { id: string; start_min: number; end_min: number; label: string; icon: string; position: number; }

export function TodayTab() {
  const { t } = useLang();
  const d = t.dash.today;
  const { tz } = useTimezone();

  const [time, setTime]           = useState(new Date());
  const [habits, setHabits]       = useState<Partial<HabitsRow>>({});
  const [customDay, setCustomDay] = useState<Record<string, boolean>>({});
  const [schedule, setSchedule]   = useState<ScheduleBlock[]>([]);
  const [habitDefs, setHabitDefs] = useState<HabitDef[]>([]);

  const [editSched, setEditSched] = useState(false);
  const [newBlock, setNewBlock] = useState({ label: "", start: "", end: "", icon: DEFAULT_ICON_KEY });
  const [newHabit, setNewHabit] = useState("");
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

  // Tick clock every second
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);

  // Load all data from server on mount
  useEffect(() => {
    const dt = today();
    api(`/api/dashboard/habits?date=${dt}`).then(data => {
      if (data && !data.error) setHabits(data);
    });
    api(`/api/dashboard/habit-custom?date=${dt}`).then(data => {
      if (data && !data.error) setCustomDay(data);
    });
    api("/api/dashboard/schedule").then((rows: ScheduleRow[] | { error: string }) => {
      if (Array.isArray(rows)) {
        setSchedule(rows.map(r => ({
          id: r.id, start: r.start_min, end: r.end_min, label: r.label, icon: r.icon,
        })));
      }
    });
    api("/api/dashboard/habit-defs").then(rows => {
      if (Array.isArray(rows)) setHabitDefs(rows);
    });
  }, []);

  const toggleBuiltin = async (key: string) => {
    const next = { ...habits, [key]: !habits[key as keyof HabitsRow] };
    setHabits(next);
    await jPost("/api/dashboard/habits", { date: today(), ...next });
  };
  const toggleCustom = async (id: string) => {
    const newVal = !customDay[id];
    setCustomDay({ ...customDay, [id]: newVal });
    await jPost("/api/dashboard/habit-custom", { date: today(), habit_id: id, done: newVal });
  };

  // Clock + "what's now" are computed in the configured timezone.
  const { h: nowH, m: nowMinute, s: nowSec } = clockParts(time, tz);
  const nowMin = nowH * 60 + nowMinute;
  const sorted = [...schedule].sort((a, b) => a.start - b.start);
  const current = sorted.find(b => nowMin >= b.start && nowMin < b.end);
  const nextBlock = current ? sorted[sorted.indexOf(current) + 1] : sorted.find(b => nowMin < b.start);

  const hh = String(nowH).padStart(2,"0");
  const mm = String(nowMinute).padStart(2,"0");
  const ss = String(nowSec).padStart(2,"0");

  const prayers = PRAYER_IDS.map(k => ({ key: k, label: d.prayerNames[k] }));
  const prayersDone = prayers.filter(p => habits[p.key as keyof HabitsRow]).length;
  const habitsDone  = habitDefs.filter(h => h.builtin ? !!habits[h.id as keyof HabitsRow] : !!customDay[h.id]).length;

  const addBlock = async () => {
    const start = parseTime(newBlock.start), end = parseTime(newBlock.end);
    if (!newBlock.label || start === null || end === null) return;
    const id = `c_${Date.now()}`;
    const blk = { id, start, end, label: newBlock.label, icon: newBlock.icon || DEFAULT_ICON_KEY };
    setSchedule([...schedule, blk]);
    setNewBlock({ label: "", start: "", end: "", icon: DEFAULT_ICON_KEY });
    await jPost("/api/dashboard/schedule", {
      id, start_min: start, end_min: end, label: blk.label, icon: blk.icon,
    });
  };
  const updateBlock = (id: string, patch: Partial<ScheduleBlock>) => {
    setSchedule(schedule.map(b => b.id === id ? { ...b, ...patch } : b));
    jPatch("/api/dashboard/schedule", {
      id,
      start_min: patch.start,
      end_min: patch.end,
      label: patch.label,
      icon: patch.icon,
    });
  };
  const removeBlock = async (id: string) => {
    setSchedule(schedule.filter(b => b.id !== id));
    await jDel("/api/dashboard/schedule", { id });
  };
  const resetSchedule = async () => {
    await jDel("/api/dashboard/schedule", { reset: true });
    const rows = await api("/api/dashboard/schedule") as ScheduleRow[];
    if (Array.isArray(rows)) {
      setSchedule(rows.map(r => ({
        id: r.id, start: r.start_min, end: r.end_min, label: r.label, icon: r.icon,
      })));
    }
    setIconPickerFor(null);
  };

  const addHabit = async () => {
    if (!newHabit.trim()) return;
    const created = await jPost("/api/dashboard/habit-defs", { label: newHabit.trim() }) as HabitDef;
    if (created && created.id) {
      setHabitDefs([...habitDefs, created]);
    }
    setNewHabit("");
  };
  const renameHabit = (id: string, label: string) => {
    setHabitDefs(habitDefs.map(h => h.id === id ? { ...h, label } : h));
  };
  const persistHabitLabel = (id: string, label: string) => {
    if (!label.trim()) return;
    jPatch("/api/dashboard/habit-defs", { id, label: label.trim() });
  };
  const removeHabit = async (id: string) => {
    setHabitDefs(habitDefs.filter(h => h.id !== id));
    await jDel("/api/dashboard/habit-defs", { id });
  };

  const currentProgress = current
    ? Math.round(((nowMin - current.start) / (current.end - current.start)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5 pt-2 animate-fade-in">

      {/* Hero clock card */}
      <Card className="p-5">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-bold tracking-tight tabular-nums leading-none">
            {hh}:{mm}
          </span>
          <span className="text-2xl font-semibold tabular-nums text-[var(--muted)] leading-none">
            :{ss}
          </span>
        </div>
        <div className="text-xs text-[var(--muted)] mt-2 capitalize">
          {dateLabel(time, tz, "ru-RU", { weekday: "long", month: "long", day: "numeric" })}
        </div>

        {current ? (
          <div className="mt-5 pt-5 border-t border-[var(--card-border)]">
            <div className="flex items-center gap-3 mb-3">
              <ScheduleIcon name={current.icon} className="h-6 w-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium">{d.now}</div>
                <div className="text-sm font-semibold truncate">{current.label}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold tabular-nums">{fmtMin(current.end)}</div>
                <div className="text-[10px] text-[var(--muted)] tabular-nums">{currentProgress}%</div>
              </div>
            </div>
            <Progress value={currentProgress} />
            {nextBlock && (
              <div className="mt-2.5 text-[11px] text-[var(--muted)] truncate">
                {d.then} <span className="text-[var(--foreground)] font-medium">{nextBlock.label}</span> · {fmtMin(nextBlock.start)}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 pt-5 border-t border-[var(--card-border)] text-xs text-[var(--muted)]">
            {nowMin < (sorted[0]?.start ?? 0) ? d.dayNotStarted : d.dayComplete}
          </div>
        )}
      </Card>

      {/* Schedule */}
      <section>
        <SectionHeader
          eyebrow={d.schedule}
          title={undefined}
          trailing={
            <>
              {editSched && (
                <Pill size="sm" onClick={resetSchedule}>
                  <RotateCcw className="h-3 w-3" />
                </Pill>
              )}
              <Pill size="sm" active={editSched} onClick={() => { setEditSched(v => !v); setIconPickerFor(null); }}>
                <Pencil className="h-3 w-3" />
                {editSched ? d.closeEdit : d.editSchedule}
              </Pill>
            </>
          }
        />

        {editSched && (
          <Card className="mb-3 p-3 space-y-2.5">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setIconPickerFor(p => p === "new" ? null : "new")}
                className="w-10 h-10 rounded-xl border border-[var(--card-border)] hover:border-[var(--foreground)]/40 flex items-center justify-center transition-all shrink-0"
                aria-label="pick icon"
              >
                <ScheduleIcon name={newBlock.icon} className="h-5 w-5" />
              </button>
              <Input
                value={newBlock.label}
                onChange={e => setNewBlock(p => ({ ...p, label: e.target.value }))}
                placeholder={d.blockLabelPh}
                className="h-10"
              />
            </div>
            {iconPickerFor === "new" && (
              <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                <IconPicker
                  value={newBlock.icon}
                  onSelect={(ic) => { setNewBlock(p => ({ ...p, icon: ic })); setIconPickerFor(null); }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newBlock.start}
                onChange={e => setNewBlock(p => ({ ...p, start: e.target.value }))}
                placeholder="09:00"
                className="h-9 tabular-nums"
              />
              <Input
                value={newBlock.end}
                onChange={e => setNewBlock(p => ({ ...p, end: e.target.value }))}
                placeholder="13:00"
                className="h-9 tabular-nums"
              />
            </div>
            <button
              onClick={addBlock}
              className="w-full py-2 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> {d.addBlock}
            </button>
          </Card>
        )}

        {/* Timeline — clean, no rail, no dots; active row gets surface highlight */}
        <Card className="p-2">
          <div className="flex flex-col gap-0.5">
            {sorted.map((b) => {
              const done = nowMin >= b.end;
              const active = nowMin >= b.start && nowMin < b.end;
              const blockProgress = active
                ? Math.round(((nowMin - b.start) / (b.end - b.start)) * 100)
                : 0;
              return (
                <div key={b.id}>
                  {editSched ? (
                    <div className="flex items-center gap-2 py-1.5 px-2">
                      <button
                        onClick={() => setIconPickerFor(p => p === b.id ? null : b.id)}
                        className="w-9 h-9 rounded-xl border border-[var(--card-border)] hover:border-[var(--foreground)]/40 flex items-center justify-center transition-all shrink-0"
                        aria-label="pick icon"
                      >
                        <ScheduleIcon name={b.icon} className="h-[18px] w-[18px]" />
                      </button>
                      <div className="text-[10px] text-[var(--muted)] tabular-nums w-20 shrink-0">
                        {fmtMin(b.start)}–{fmtMin(b.end)}
                      </div>
                      <Input
                        value={b.label}
                        onChange={e => updateBlock(b.id, { label: e.target.value })}
                        className="h-8 text-xs"
                      />
                      <IconButton
                        size="sm"
                        variant="ghost"
                        onClick={() => removeBlock(b.id)}
                        className="hover:text-red-500"
                        aria-label="remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ) : (
                    <div
                      className={[
                        "relative flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all overflow-hidden",
                        active ? "bg-[var(--surface-2)]" : "",
                        done ? "opacity-40" : "",
                      ].join(" ")}
                    >
                      {active && (
                        <div
                          className="absolute inset-y-0 left-0 w-0.5 bg-[var(--foreground)]"
                          aria-hidden
                        />
                      )}
                      <div className={[
                        "text-xs tabular-nums w-11 shrink-0 text-right",
                        active ? "text-[var(--foreground)] font-semibold" : "text-[var(--muted)]",
                      ].join(" ")}>
                        {fmtMin(b.start)}
                      </div>
                      <ScheduleIcon
                        name={b.icon}
                        className={[
                          "h-5 w-5 shrink-0 transition-transform",
                          active ? "scale-110" : "",
                        ].join(" ")}
                      />
                      <span className={[
                        "text-sm flex-1 truncate",
                        active ? "font-semibold" : "",
                      ].join(" ")}>{b.label}</span>
                      {active && (
                        <span className="text-[10px] tabular-nums text-[var(--muted)] shrink-0">
                          {blockProgress}%
                        </span>
                      )}
                    </div>
                  )}
                  {editSched && iconPickerFor === b.id && (
                    <div className="py-2 px-2 mb-1 rounded-xl bg-[var(--surface-2)]">
                      <IconPicker
                        value={b.icon}
                        onSelect={(ic) => { updateBlock(b.id, { icon: ic }); setIconPickerFor(null); }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Prayers */}
      <section>
        <SectionHeader
          eyebrow={d.prayers}
          trailing={
            <span className="text-xs tabular-nums font-semibold text-[var(--muted)]">
              {prayersDone}<span className="text-[var(--card-border)]">/5</span>
            </span>
          }
        />
        <div className="grid grid-cols-5 gap-1.5">
          {prayers.map(p => {
            const done = !!habits[p.key as keyof HabitsRow];
            return (
              <button
                key={p.key}
                onClick={() => toggleBuiltin(p.key)}
                className={[
                  "py-3 rounded-2xl border text-xs font-medium transition-all cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  done
                    ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)] shadow-soft"
                    : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {p.label.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Habits */}
      <section>
        <SectionHeader
          eyebrow={d.habits}
          trailing={
            <span className="text-xs tabular-nums font-semibold text-[var(--muted)]">
              {habitsDone}<span className="text-[var(--card-border)]">/{habitDefs.length}</span>
            </span>
          }
        />

        <Card className="p-3">
          <div className="flex flex-col gap-1">
            {habitDefs.map((hab, idx) => {
              const checked = hab.builtin ? !!habits[hab.id as keyof HabitsRow] : !!customDay[hab.id];
              return (
                <div key={hab.id}>
                  {idx > 0 && <Separator className="my-1" />}
                  <div className="flex items-center gap-3 py-2 group">
                    <button
                      onClick={() => hab.builtin ? toggleBuiltin(hab.id) : toggleCustom(hab.id)}
                      className={[
                        "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer",
                        checked
                          ? "bg-[var(--foreground)] border-[var(--foreground)]"
                          : "border-[var(--card-border)] hover:border-[var(--foreground)]/40",
                      ].join(" ")}
                    >
                      {checked && <Check className="h-3 w-3 text-[var(--background)]" strokeWidth={3} />}
                    </button>
                    <input
                      value={hab.label}
                      onChange={e => renameHabit(hab.id, e.target.value)}
                      onBlur={e => persistHabitLabel(hab.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                      }}
                      className={[
                        "text-sm flex-1 bg-transparent outline-none transition-all",
                        "border-0 focus:bg-[var(--surface-2)] rounded-md px-1 -mx-1",
                        checked ? "line-through text-[var(--muted)]" : "",
                      ].join(" ")}
                      aria-label="habit label"
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() => removeHabit(hab.id)}
                      className="opacity-40 hover:opacity-100 hover:text-red-500"
                      aria-label="remove habit"
                    >
                      <X className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              );
            })}

            {habitDefs.length > 0 && <Separator className="my-1" />}

            <div className="flex items-center gap-2 py-1.5">
              <button
                onClick={addHabit}
                disabled={!newHabit.trim()}
                className={[
                  "w-5 h-5 rounded-md border border-dashed flex items-center justify-center shrink-0 transition-all",
                  newHabit.trim()
                    ? "border-[var(--foreground)]/60 text-[var(--foreground)] cursor-pointer hover:bg-[var(--surface-2)]"
                    : "border-[var(--card-border)] text-[var(--muted)] cursor-not-allowed",
                ].join(" ")}
                aria-label="add habit"
              >
                <Plus className="h-3 w-3" strokeWidth={3} />
              </button>
              <Input
                value={newHabit}
                onChange={e => setNewHabit(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addHabit()}
                placeholder={d.habitLabelPh}
                className="h-8 text-sm border-0 bg-transparent px-0 focus-visible:ring-0"
              />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function IconPicker({ value, onSelect }: { value: string; onSelect: (ic: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {SCHEDULE_ICON_KEYS.map(key => {
        const selected = value === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-label={key}
            className={[
              "aspect-square rounded-xl flex items-center justify-center transition-all cursor-pointer",
              selected
                ? "bg-[var(--foreground)] text-[var(--background)] ring-2 ring-[var(--foreground)] scale-105"
                : "bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--surface-2)] hover:scale-105",
            ].join(" ")}
          >
            <ScheduleIcon name={key} className="h-[18px] w-[18px]" />
          </button>
        );
      })}
    </div>
  );
}
