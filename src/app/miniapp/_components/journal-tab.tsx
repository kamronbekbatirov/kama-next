"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Plus, Trash2, Save, Check, Loader2, Calendar, ChevronRight, Moon, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { NoteEditor } from "./note-editor";
import { PinModal } from "./pin-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import {
  api, jPost, jPatch, jDel, today, getLast, useHashView,
  PRAYER_IDS,
  type DailyLog, type HabitsRow, type Note,
} from "./_shared";
import { SectionHeader, EmptyState, SoftCard, IconButton, StatBlock } from "./dashboard-ui";
import { JobsTab } from "./jobs-tab";

export function JournalTab() {
  const [sub, setSub] = useHashView("journal", ["log", "notes", "jobs", "history"], "log");
  const { t } = useLang();
  const d = t.dash.tabs;

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">
      <Tabs value={sub} onValueChange={setSub}>
        <TabsList className="self-start">
          <TabsTrigger value="log">{d.log}</TabsTrigger>
          <TabsTrigger value="notes">{d.notes}</TabsTrigger>
          <TabsTrigger value="jobs">{d.jobs}</TabsTrigger>
          <TabsTrigger value="history">{d.history}</TabsTrigger>
        </TabsList>

        <TabsContent value="log"><LogContent /></TabsContent>
        <TabsContent value="notes"><NotesContent /></TabsContent>
        <TabsContent value="jobs"><JobsTab /></TabsContent>
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
            {d.dateLabel}
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

// Notes are stored as HTML (rich editor) but old notes / Claude-written notes
// may be plain text. Strip tags for the card preview either way.
function plainText(content: string): string {
  if (!content) return "";
  if (!content.includes("<")) return content;
  return content
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
  const [status, setStatus]   = useState<"idle"|"saving"|"saved"|"unsaved">("idle");
  // Stable key for the editor across an editing session — so a new note getting
  // its id mid-typing doesn't remount the editor and drop the cursor.
  const [editorKey, setEditorKey] = useState("new");

  // Note locking: a 4-digit PIN gates locked notes' content (server-side).
  const [lock, setLock] = useState({ pinSet: false, unlocked: false });
  const [pinModal, setPinModal] = useState<
    { mode: "set" | "enter"; submit: (pin: string) => Promise<{ ok: boolean; error?: string }> } | null
  >(null);

  // Autosave plumbing — refs avoid stale closures and create/update races.
  const idRef      = useRef<number|null>(null);          // current note id (null = unsaved new)
  const stateRef   = useRef({ title: "", content: "" }); // latest editor content
  const savedRef   = useRef({ title: "", content: "" }); // last persisted content
  const savingRef  = useRef(false);                      // a save is in flight
  const pendingRef = useRef(false);                      // edits arrived during a save
  const editingRef = useRef(false);                      // editor view open?

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/notes");
    if (Array.isArray(data)) setNotes(data);
  }, []);
  const loadLock = useCallback(async () => {
    const data = await api("/api/dashboard/notes/lock");
    if (data && typeof data.pinSet === "boolean") {
      setLock({ pinSet: data.pinSet, unlocked: !!data.unlocked });
    }
  }, []);
  useEffect(() => { load(); loadLock(); }, [load, loadLock]);
  useEffect(() => { stateRef.current = { title, content }; }, [title, content]);

  const flush = useCallback(async () => {
    if (!editingRef.current) return;
    const { title: ti, content: co } = stateRef.current;
    if (savedRef.current.title === ti && savedRef.current.content === co) return;     // unchanged
    if (idRef.current === null && !ti.trim() && !plainText(co).trim()) return;        // don't create empty
    if (savingRef.current) { pendingRef.current = true; return; }                     // coalesce
    savingRef.current = true;
    setStatus("saving");
    try {
      if (idRef.current === null) {
        const c = await jPost("/api/dashboard/notes", { title: ti, content: co });
        if (c?.id) { idRef.current = c.id; setSelected(c); setIsNew(false); }
      } else {
        await jPatch("/api/dashboard/notes", { id: idRef.current, title: ti, content: co });
      }
      savedRef.current = { title: ti, content: co };
      setStatus("saved");
      load();
    } catch {
      setStatus("unsaved");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; flush(); }                // edits during save
    }
  }, [load]);

  // Debounced autosave on edits — skips the programmatic set made when opening a note.
  useEffect(() => {
    if (!editingRef.current) return;
    if (savedRef.current.title === title && savedRef.current.content === content) return;
    setStatus("unsaved");
    const id = setTimeout(() => { void flush(); }, 700);
    return () => clearTimeout(id);
  }, [title, content, flush]);

  // Best-effort save when the tab/page is closed (keepalive survives unload),
  // and a final save when this component unmounts (e.g. switching sub-tab).
  useEffect(() => {
    const beacon = () => {
      if (!editingRef.current) return;
      const { title: ti, content: co } = stateRef.current;
      if (savedRef.current.title === ti && savedRef.current.content === co) return;
      if (idRef.current === null && !ti.trim() && !plainText(co).trim()) return;
      fetch("/api/dashboard/notes", {
        method: idRef.current === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idRef.current === null ? { title: ti, content: co } : { id: idRef.current, title: ti, content: co }),
        keepalive: true,
      });
      savedRef.current = { title: ti, content: co };
    };
    window.addEventListener("beforeunload", beacon);
    return () => { window.removeEventListener("beforeunload", beacon); beacon(); };
  }, []);

  const openNew = () => {
    editingRef.current = true; idRef.current = null;
    savedRef.current = { title: "", content: "" };
    setSelected(null); setIsNew(true); setTitle(""); setContent(""); setStatus("idle");
    setEditorKey(`new-${Date.now()}`);
  };
  const openNote = (n: Note) => {
    editingRef.current = true; idRef.current = n.id;
    savedRef.current = { title: n.title, content: n.content };
    setSelected(n); setIsNew(false); setTitle(n.title); setContent(n.content); setStatus("saved");
    setEditorKey(`note-${n.id}`);
  };
  const closeEditor = async () => {
    await flush();
    editingRef.current = false;
    setSelected(null); setIsNew(false); setStatus("idle");
  };

  // Open a note from the list. Locked + still gated → ask for the PIN first,
  // then re-fetch (now with content) and open it.
  const tapNote = (n: Note) => {
    if (n.locked && !lock.unlocked) {
      setPinModal({
        mode: "enter",
        submit: async (pin) => {
          const res = await jPost("/api/dashboard/notes/lock", { action: "unlock", pin });
          if (!res?.ok) return { ok: false, error: res?.error };
          setLock(l => ({ ...l, unlocked: true }));
          const fresh = await api("/api/dashboard/notes");
          if (Array.isArray(fresh)) {
            setNotes(fresh);
            openNote(fresh.find((x: Note) => x.id === n.id) ?? n);
          } else {
            openNote(n);
          }
          return { ok: true };
        },
      });
    } else {
      openNote(n);
    }
  };

  // Lock / unlock the note currently open in the editor.
  const setNoteLocked = async (locked: boolean) => {
    await flush();                              // make sure it exists (has an id)
    const id = idRef.current ?? selected?.id;
    if (!id) return;
    await jPatch("/api/dashboard/notes", { id, locked });
    setSelected(s => (s ? { ...s, locked } : s));
    load();
  };

  const onLockClick = () => {
    const locked = selected?.locked ?? false;
    if (locked) { void setNoteLocked(false); return; }   // already unlocked here → just remove the lock
    if (lock.pinSet) { void setNoteLocked(true); return; } // PIN exists → lock straight away
    // No PIN yet → set one, then lock this note.
    setPinModal({
      mode: "set",
      submit: async (pin) => {
        const res = await jPost("/api/dashboard/notes/lock", { action: "set", pin });
        if (!res?.ok) return { ok: false, error: res?.error };
        setLock({ pinSet: true, unlocked: true });
        await setNoteLocked(true);
        return { ok: true };
      },
    });
  };

  const lockNow = async () => {
    await jPost("/api/dashboard/notes/lock", { action: "lock" });
    setLock(l => ({ ...l, unlocked: false }));
    load();
  };

  const pinModalEl = pinModal && (
    <PinModal mode={pinModal.mode} onClose={() => setPinModal(null)} onSubmit={pinModal.submit} />
  );

  if (isNew || selected) {
    return (
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <IconButton size="md" variant="ghost" onClick={() => { void closeEditor(); }} aria-label="back">
            <ArrowLeft className="h-4 w-4" />
          </IconButton>

          {/* Live autosave status — click to save immediately */}
          {status !== "idle" && (
            <button
              type="button"
              onClick={() => void flush()}
              title={status === "unsaved" ? d.save : undefined}
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                status === "saved" ? "text-emerald-500"
                : status === "saving" ? "text-[var(--muted)]"
                : "text-yellow-500"
              }`}
            >
              {status === "saving" ? <Loader2 className="h-3 w-3 animate-spin" />
                : status === "saved" ? <Check className="h-3 w-3" />
                : <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />}
              {status === "saving" ? d.saving : status === "saved" ? d.saved : d.unsaved}
            </button>
          )}

          {/* Compact icon actions so the header never overflows / scrolls sideways */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button
              onClick={onLockClick}
              title={selected?.locked ? d.unlockNote : d.lockNote}
              aria-label={selected?.locked ? d.unlockNote : d.lockNote}
              className={[
                "h-9 w-9 inline-flex items-center justify-center rounded-full border transition-all shrink-0",
                selected?.locked
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:opacity-85"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40",
              ].join(" ")}
            >
              {selected?.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </button>
            {selected && (
              <button
                onClick={async () => {
                  await jDel("/api/dashboard/notes", { id: selected.id });
                  editingRef.current = false;
                  setSelected(null); setIsNew(false); setStatus("idle"); load();
                }}
                title={d.del}
                aria-label={d.del}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white transition-all shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => void flush()}
              title={d.save}
              aria-label={d.save}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 transition-opacity shrink-0"
            >
              <Save className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={d.titlePh}
          className="h-12 text-lg font-semibold border-0 px-0 bg-transparent rounded-none border-b border-[var(--card-border)] focus-visible:ring-0 focus:border-[var(--foreground)]"
        />
        <NoteEditor
          key={editorKey}
          value={content}
          onChange={setContent}
          placeholder={d.contentPh}
        />
        {pinModalEl}
      </div>
    );
  }

  const hasLocked = notes.some(n => n.locked);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={openNew}
        className="w-full h-11 rounded-2xl border-2 border-dashed border-[var(--card-border)] hover:border-[var(--foreground)]/40 text-[var(--muted)] hover:text-[var(--foreground)] transition-all flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        {d.newNote}
      </button>

      {hasLocked && lock.unlocked && (
        <button
          onClick={() => void lockNow()}
          className="self-start inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          {d.unlockedNotice} · <span className="underline underline-offset-2">{d.lockNow}</span>
        </button>
      )}

      {notes.length === 0 ? (
        <SoftCard>
          <EmptyState icon={<FileText className="h-8 w-8" />} title={d.noNotes} />
        </SoftCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {notes.map(n => {
            const gated = n.locked && !lock.unlocked;
            return (
              <button
                key={n.id}
                onClick={() => tapNote(n)}
                className="text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-soft hover:shadow-pop hover:border-[var(--foreground)]/30 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-sm font-semibold truncate flex-1 flex items-center gap-1.5 min-w-0">
                    {n.locked && <Lock className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />}
                    <span className="truncate">{n.title || d.untitled}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--muted)] shrink-0 group-hover:text-[var(--foreground)] transition-colors" />
                </div>
                {gated ? (
                  <div className="text-xs text-[var(--muted)] italic mb-2 flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    {d.lockedNote}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--muted)] line-clamp-3 mb-2 leading-relaxed">
                    {plainText(n.content) || "—"}
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {new Date(n.updated_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {pinModalEl}
    </div>
  );
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
interface HabitDef { id: string; label: string; builtin: boolean; position: number; }
interface CustomCompletion { date: string; habit_id: string; done: boolean; }
interface HistoryData {
  habits: HabitsRow[];
  logs: { date: string }[];
  defs: HabitDef[];
  customCompletions: CustomCompletion[];
}

function HistoryContent() {
  const { t } = useLang();
  const d = t.dash;
  const h = d.history;
  const [data, setData] = useState<HistoryData | null>(null);

  useEffect(() => {
    api("/api/dashboard/history?days=14").then(r => { if (!r.error) setData(r); });
  }, []);

  const days = getLast(14);
  const habitsMap = new Map<string, HabitsRow>(
    (data?.habits ?? []).map(h => [String(h.date).slice(0, 10), h]),
  );
  const customMap = new Map<string, boolean>();
  for (const c of data?.customCompletions ?? []) {
    customMap.set(`${c.date}::${c.habit_id}`, !!c.done);
  }
  const logsSet = new Set((data?.logs ?? []).map(l => String(l.date).slice(0, 10)));

  const isDone = (def: HabitDef, date: string): boolean =>
    def.builtin
      ? !!(habitsMap.get(date) as Record<string, boolean> | undefined)?.[def.id]
      : !!customMap.get(`${date}::${def.id}`);

  const computeStreak = (predicate: (date: string) => boolean) => {
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (predicate(days[i])) streak++;
      else break;
    }
    return streak;
  };

  const allPrayersDone = (date: string) =>
    PRAYER_IDS.every(k => !!(habitsMap.get(date) as Record<string, boolean> | undefined)?.[k]);

  const defs = (data?.defs ?? []).slice().sort((a, b) =>
    a.builtin === b.builtin ? a.position - b.position : a.builtin ? -1 : 1,
  );

  const allHabitsDone = (date: string) =>
    defs.length > 0 && defs.every(def => isDone(def, date));

  const prayerStreak = data ? computeStreak(allPrayersDone) : 0;
  const habitStreak  = data && defs.length > 0 ? computeStreak(allHabitsDone) : 0;
  const logsCount    = days.filter(dt => logsSet.has(dt)).length;

  const totalHabits  = defs.length;
  const totalPrayers = 5;

  const Heatmap = (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <td className="w-24" />
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
          {PRAYER_IDS.map(k => (
            <tr key={`p_${k}`}>
              <td className="text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 py-1 truncate">
                {d.today.prayerNames[k]}
              </td>
              {days.map(dt => {
                const done = !!(habitsMap.get(dt) as unknown as Record<string, boolean> | undefined)?.[k];
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
          {defs.map((def, idx) => (
            <tr key={`h_${def.id}`}>
              <td className={[
                "text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 py-1 truncate",
                idx === 0 ? "pt-3" : "",
              ].join(" ")}>{def.label || def.id}</td>
              {days.map(dt => {
                const done = isDone(def, dt);
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
            <td className="text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 pt-3">
              {h.log}
            </td>
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
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="grid grid-cols-3 gap-3">
          <StatBlock
            value={prayerStreak}
            label={h.prayerStreak}
            hint={prayerStreak === 1 ? h.day : h.days}
          />
          <StatBlock
            value={habitStreak}
            label={h.habitStreak}
            hint={habitStreak === 1 ? h.day : h.days}
          />
          <StatBlock value={`${logsCount}/14`} label={h.logsLabel} />
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader eyebrow={h.last14} className="mb-3" />
        {!data ? (
          <HeatmapSkeleton />
        ) : (
          Heatmap
        )}
      </Card>

      <section>
        <SectionHeader eyebrow={h.last7} />
        <Card className="p-2">
          <div className="flex flex-col">
            {days.slice(-7).reverse().map((dt, idx) => {
              const habitsRow = habitsMap.get(dt);
              const pDone = habitsRow
                ? PRAYER_IDS.filter(k => (habitsRow as unknown as Record<string, boolean>)[k]).length
                : 0;
              const hDone = defs.filter(def => isDone(def, dt)).length;
              const hasLog = logsSet.has(dt);
              const dateLabel = new Date(dt).toLocaleDateString("ru-RU", {
                weekday: "short", day: "numeric", month: "short",
              });
              const isToday = dt === today();
              return (
                <div
                  key={dt}
                  className={[
                    "flex items-center gap-3 py-2.5 px-2 rounded-xl",
                    idx > 0 ? "border-t border-[var(--card-border)]" : "",
                    isToday ? "bg-[var(--surface-2)]" : "",
                  ].join(" ")}
                >
                  <div className="text-xs font-medium w-28 shrink-0">{dateLabel}</div>
                  <div className="flex gap-4 flex-1 text-xs tabular-nums">
                    <span className={[
                      "inline-flex items-center gap-1",
                      pDone === totalPrayers ? "text-emerald-500"
                      : pDone === 0 ? "text-[var(--muted)]"
                      : "text-[var(--foreground)]",
                    ].join(" ")}>
                      <Moon className="h-3 w-3" aria-hidden />
                      <span className="font-semibold">{pDone}</span>
                      <span className="text-[var(--muted)]">/{totalPrayers}</span>
                    </span>
                    {totalHabits > 0 && (
                      <span className={[
                        "inline-flex items-center gap-1",
                        hDone === totalHabits ? "text-emerald-500"
                        : hDone === 0 ? "text-[var(--muted)]"
                        : "text-[var(--foreground)]",
                      ].join(" ")}>
                        <Check className="h-3 w-3" aria-hidden />
                        <span className="font-semibold">{hDone}</span>
                        <span className="text-[var(--muted)]">/{totalHabits}</span>
                      </span>
                    )}
                    {hasLog && <span className="text-[var(--muted)]">○ {h.log}</span>}
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

function HeatmapSkeleton() {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full" style={{ tableLayout: "fixed" }}>
        <tbody>
          {Array.from({ length: 7 }).map((_, r) => (
            <tr key={r}>
              <td className="w-24 pr-2 py-1">
                <div className="h-2.5 w-16 rounded-md bg-[var(--muted-bg)] animate-pulse" />
              </td>
              {Array.from({ length: 14 }).map((_, c) => (
                <td key={c} className="text-center py-0.5">
                  <div
                    className="w-3 h-3 mx-auto rounded-[3px] bg-[var(--muted-bg)] animate-pulse"
                    style={{ animationDelay: `${(r + c) * 30}ms` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
