"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Plus, Trash2, Save, Check, Calendar, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import {
  api, jPost, jPatch, jDel, today, getLast,
  PRAYER_IDS, BUILTIN_IDS,
  type DailyLog, type HabitsRow, type Note,
} from "./_shared";
import { SectionHeader, EmptyState, SoftCard, IconButton, StatBlock } from "./dashboard-ui";

export function JournalTab() {
  const [sub, setSub] = useState("log");
  const { t } = useLang();
  const d = t.dash.tabs;

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">
      <Tabs value={sub} onValueChange={setSub}>
        <TabsList className="self-start">
          <TabsTrigger value="log">{d.log}</TabsTrigger>
          <TabsTrigger value="notes">{d.notes}</TabsTrigger>
          <TabsTrigger value="history">{d.history}</TabsTrigger>
        </TabsList>

        <TabsContent value="log"><LogContent /></TabsContent>
        <TabsContent value="notes"><NotesContent /></TabsContent>
        <TabsContent value="history"><HistoryContent /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
function LogContent() {
  const { t } = useLang();
  const d = t.dash.log;
  const [log, setLog]       = useState<Partial<DailyLog>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [date, setDate]     = useState(today());

  const load = useCallback(async (dt: string) => {
    const data = await api(`/api/dashboard/log?date=${dt}`);
    setLog(data && !data.error ? (data ?? {}) : {});
  }, []);
  useEffect(() => { load(date); }, [date, load]);

  const set = (key: keyof DailyLog, v: string|number) => {
    setLog(p => ({ ...p, [key]: v }));
    setSaved(false);
  };
  const save = async () => {
    setSaving(true);
    await jPost("/api/dashboard/log", { date, ...log });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
            <Calendar className="inline h-3 w-3 mr-1.5" />
            Date
          </div>
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-8 text-xs tabular-nums w-auto"
          />
        </div>
      </Card>

      <section>
        <SectionHeader eyebrow={d.reflection} />
        <Card className="p-4 space-y-4">
          {[
            { key: "what_worked"   as const, q: d.q1 },
            { key: "tomorrow_task" as const, q: d.q2 },
            { key: "visa_progress" as const, q: d.q3 },
            { key: "notes"         as const, q: d.notes },
          ].map(({ key, q }) => (
            <div key={key}>
              <label className="text-[11px] text-[var(--muted)] font-medium block mb-1.5">{q}</label>
              <Textarea
                value={log[key] ?? ""}
                onChange={e => set(key, e.target.value)}
                placeholder={key === "notes" ? d.notesPh : d.writePh}
                rows={2}
              />
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader eyebrow={d.workout} />
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: "workout_pushups" as const, label: d.pushups },
              { key: "workout_plank"   as const, label: d.plank },
              { key: "workout_walk"    as const, label: d.walk },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium block mb-1.5">{label}</label>
                <input
                  type="number"
                  value={log[key] ?? ""}
                  onChange={e => set(key, parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent text-2xl font-semibold tabular-nums outline-none border-b border-[var(--card-border)] pb-1 focus:border-[var(--foreground)] transition-colors"
                />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <button
        onClick={save}
        disabled={saving}
        className={[
          "w-full h-11 rounded-2xl text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50",
          saved
            ? "bg-emerald-500 text-white"
            : "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85",
        ].join(" ")}
      >
        {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? d.saving : saved ? d.saved : d.save}
      </button>
    </div>
  );
}

// ─── NOTES ───────────────────────────────────────────────────────────────────
function NotesContent() {
  const { t } = useLang();
  const d = t.dash.notes;
  const [notes, setNotes]     = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note|null>(null);
  const [isNew, setIsNew]     = useState(false);
  const [title, setTitle]     = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/notes");
    if (Array.isArray(data)) setNotes(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setSelected(null); setIsNew(true); setTitle(""); setContent(""); };
  const openNote = (n: Note) => { setSelected(n); setIsNew(false); setTitle(n.title); setContent(n.content); };

  const save = async () => {
    setSaving(true);
    if (isNew) {
      const c = await jPost("/api/dashboard/notes", { title, content });
      setSelected(c); setIsNew(false);
    } else if (selected) {
      const u = await jPatch("/api/dashboard/notes", { id: selected.id, title, content });
      setSelected(u);
    }
    setSaving(false); load();
  };

  if (isNew || selected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <IconButton size="md" variant="ghost" onClick={() => { setSelected(null); setIsNew(false); }} aria-label="back">
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <div className="flex gap-2 ml-auto">
            {selected && (
              <button
                onClick={async () => {
                  await jDel("/api/dashboard/notes", { id: selected.id });
                  setSelected(null); setIsNew(false); load();
                }}
                className="h-9 px-4 rounded-full border border-red-500/40 text-red-500 text-xs font-semibold hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {d.del}
              </button>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="h-9 px-4 rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity disabled:opacity-30 flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {d.save}
            </button>
          </div>
        </div>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={d.titlePh}
          className="h-12 text-lg font-semibold border-0 px-0 bg-transparent rounded-none border-b border-[var(--card-border)] focus-visible:ring-0 focus:border-[var(--foreground)]"
        />
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={d.contentPh}
          rows={20}
          className="text-sm border-0 px-0 bg-transparent rounded-none focus-visible:ring-0 resize-none min-h-[400px]"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={openNew}
        className="w-full h-11 rounded-2xl border-2 border-dashed border-[var(--card-border)] hover:border-[var(--foreground)]/40 text-[var(--muted)] hover:text-[var(--foreground)] transition-all flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        {d.newNote}
      </button>

      {notes.length === 0 ? (
        <SoftCard>
          <EmptyState icon={<FileText className="h-8 w-8" />} title={d.noNotes} />
        </SoftCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {notes.map(n => (
            <button
              key={n.id}
              onClick={() => openNote(n)}
              className="text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-soft hover:shadow-pop hover:border-[var(--foreground)]/30 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm font-semibold truncate flex-1">
                  {n.title || d.untitled}
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--muted)] shrink-0 group-hover:text-[var(--foreground)] transition-colors" />
              </div>
              <div className="text-xs text-[var(--muted)] line-clamp-3 mb-2 leading-relaxed">
                {n.content || "—"}
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {new Date(n.updated_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
function HistoryContent() {
  const { t } = useLang();
  const d = t.dash;
  const [data, setData] = useState<{ habits: HabitsRow[]; logs: { date: string }[] } | null>(null);

  useEffect(() => {
    api("/api/dashboard/history?days=14").then(r => { if (!r.error) setData(r); });
  }, []);

  const days = getLast(14);
  const habitsMap = Object.fromEntries((data?.habits ?? []).map(h => [h.date, h]));
  const logsSet   = new Set((data?.logs ?? []).map(l => l.date));

  const computeStreak = (key: keyof HabitsRow) => {
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (habitsMap[days[i]]?.[key]) streak++;
      else break;
    }
    return streak;
  };

  const prayerStreak = Math.min(...PRAYER_IDS.map(k => computeStreak(k)));
  const habitStreak  = Math.min(...BUILTIN_IDS.map(k => computeStreak(k)));
  const logsCount    = days.filter(dt => logsSet.has(dt)).length;

  const ROWS: { key: keyof HabitsRow; label: string }[] = [
    ...PRAYER_IDS.map(k => ({ key: k as keyof HabitsRow, label: d.today.prayerNames[k] })),
    ...BUILTIN_IDS.map((k, i) => ({ key: k as keyof HabitsRow, label: d.today.defaultHabits[i] ?? k })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Streak cards */}
      <Card className="p-5">
        <div className="grid grid-cols-3 gap-3">
          <StatBlock value={prayerStreak} label={`${d.today.prayers} streak`} hint={`${prayerStreak === 1 ? "day" : "days"}`} />
          <StatBlock value={habitStreak}  label={`${d.today.habits} streak`}  hint={`${habitStreak === 1 ? "day" : "days"}`} />
          <StatBlock value={`${logsCount}/14`} label="logs" />
        </div>
      </Card>

      {/* Habit grid */}
      <Card className="p-4">
        <SectionHeader eyebrow="Last 14 days" className="mb-3" />
        {!data ? (
          <div className="text-xs text-[var(--muted)] text-center py-6 animate-pulse">Loading...</div>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <td className="w-20" />
                  {days.map(dt => {
                    const dayNum = new Date(dt).getDate();
                    const isToday = dt === today();
                    return (
                      <td key={dt} className="text-center pb-2">
                        <div className={[
                          "text-[10px] tabular-nums font-medium",
                          isToday ? "text-[var(--foreground)]" : "text-[var(--muted)]",
                        ].join(" ")}>
                          {dayNum}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(({ key, label }, idx) => (
                  <tr key={key}>
                    <td className={[
                      "text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 py-1 truncate",
                      idx === PRAYER_IDS.length ? "pt-3" : "",
                    ].join(" ")}>{label}</td>
                    {days.map(dt => {
                      const done = !!habitsMap[dt]?.[key];
                      return (
                        <td key={dt} className="text-center py-0.5">
                          <div className={[
                            "w-3 h-3 mx-auto rounded-[3px] transition-all",
                            done ? "bg-[var(--foreground)]" : "bg-[var(--muted-bg)]",
                          ].join(" ")} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 pt-3">Log</td>
                  {days.map(dt => (
                    <td key={dt} className="text-center pt-2">
                      <div className={[
                        "w-3 h-3 mx-auto rounded-[3px] border transition-all",
                        logsSet.has(dt)
                          ? "bg-[var(--foreground)] border-[var(--foreground)]"
                          : "border-[var(--card-border)]",
                      ].join(" ")} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Last 7 days summary */}
      <section>
        <SectionHeader eyebrow="Last 7 days" />
        <Card className="p-2">
          <div className="flex flex-col">
            {days.slice(-7).reverse().map((dt, idx) => {
              const h = habitsMap[dt];
              const pDone = h ? PRAYER_IDS.filter(k => h[k]).length : 0;
              const hDone = h ? BUILTIN_IDS.filter(k => h[k]).length : 0;
              const hasLog = logsSet.has(dt);
              const dateLabel = new Date(dt).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
              return (
                <div
                  key={dt}
                  className={[
                    "flex items-center gap-3 py-2.5 px-2 rounded-xl",
                    idx > 0 ? "border-t border-[var(--card-border)]" : "",
                  ].join(" ")}
                >
                  <div className="text-xs font-medium w-28 shrink-0">{dateLabel}</div>
                  <div className="flex gap-3 flex-1 text-xs tabular-nums">
                    <span className={pDone === 5 ? "" : pDone === 0 ? "text-[var(--muted)]" : "text-yellow-500"}>
                      ☽ <span className="font-semibold">{pDone}/5</span>
                    </span>
                    <span className={hDone >= 4 ? "" : hDone === 0 ? "text-[var(--muted)]" : "text-yellow-500"}>
                      ✓ <span className="font-semibold">{hDone}/5</span>
                    </span>
                    {hasLog && <span className="text-[var(--muted)]">○ log</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
