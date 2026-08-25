"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, FileText, Plus, Minus, Trash2, Save, Check, Loader2, Calendar, ChevronLeft,
  ChevronRight, Moon, Lock, LockOpen, ShieldCheck, Target, ListPlus, Dumbbell, Timer,
  Footprints, Download, type LucideIcon,
} from "lucide-react";
import { NoteEditor } from "./note-editor";
import { PinModal } from "./pin-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import {
  api, jPost, jPatch, jDel, todayIn, getLast, shiftDate, useHashView, localeOf, saveFile,
  PRAYER_IDS,
  type DailyLog, type HabitsRow, type Note,
} from "./_shared";
import { SectionHeader, EmptyState, SoftCard, IconButton, StatBlock } from "./dashboard-ui";
import { useTimezone } from "./timezone";
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
// Everything the form edits. Kept as one flat list so a payload can be
// snapshot-compared (JSON) to decide whether an autosave is even needed.
const LOG_TEXT_FIELDS = ["what_worked", "tomorrow_task", "notes", "visa_progress"] as const;
const LOG_NUM_FIELDS  = ["workout_pushups", "workout_plank", "workout_walk"] as const;
type LogDraft = Record<(typeof LOG_TEXT_FIELDS)[number], string> &
                Record<(typeof LOG_NUM_FIELDS)[number], number>;

const EMPTY_DRAFT: LogDraft = {
  what_worked: "", tomorrow_task: "", notes: "", visa_progress: "",
  workout_pushups: 0, workout_plank: 0, workout_walk: 0,
};

function toDraft(row: Partial<DailyLog> | null | undefined): LogDraft {
  const out = { ...EMPTY_DRAFT };
  if (!row) return out;
  for (const f of LOG_TEXT_FIELDS) out[f] = (row[f] as string | null) ?? "";
  for (const f of LOG_NUM_FIELDS)  out[f] = Number(row[f] ?? 0) || 0;
  return out;
}

function isBlank(dr: LogDraft): boolean {
  return LOG_TEXT_FIELDS.every(f => !dr[f].trim()) && LOG_NUM_FIELDS.every(f => !dr[f]);
}

function LogContent() {
  const { t } = useLang();
  const d = t.dash.log;
  const { tz } = useTimezone();
  const [date, setDate]   = useState(() => todayIn());
  const [draft, setDraft] = useState<LogDraft>(EMPTY_DRAFT);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "unsaved">("idle");
  // Yesterday's answer to "most important task for tomorrow" — i.e. today's brief.
  const [carry, setCarry] = useState<{ date: string; text: string } | null>(null);

  // Refs so the debounced save always writes the latest values to the date they
  // were typed under, even if the user has already flipped to another day.
  const draftRef = useRef<LogDraft>(EMPTY_DRAFT);
  const dateRef  = useRef(date);
  const savedRef = useRef(JSON.stringify(EMPTY_DRAFT));
  const busyRef  = useRef(false);
  const againRef = useRef(false);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const flush = useCallback(async () => {
    const dt   = dateRef.current;
    const snap = JSON.stringify(draftRef.current);
    if (snap === savedRef.current) return;                       // nothing changed
    if (isBlank(draftRef.current) && savedRef.current === JSON.stringify(EMPTY_DRAFT)) {
      return;                                                    // never create an empty row
    }
    if (busyRef.current) { againRef.current = true; return; }    // coalesce
    busyRef.current = true;
    setStatus("saving");
    try {
      await jPost("/api/dashboard/log", { date: dt, ...draftRef.current });
      savedRef.current = snap;
      setStatus("saved");
    } catch {
      setStatus("unsaved");
    } finally {
      busyRef.current = false;
      if (againRef.current) { againRef.current = false; void flush(); }
    }
  }, []);

  // Load the picked day (and the day before it, for the carry-over card).
  useEffect(() => {
    let cancelled = false;
    dateRef.current = date;
    setStatus("idle");
    api(`/api/dashboard/log?date=${date}`).then(row => {
      if (cancelled) return;
      const next = toDraft(row && !row.error ? row : null);
      setDraft(next);
      draftRef.current = next;
      savedRef.current = JSON.stringify(next);
    });
    const prev = shiftDate(date, -1);
    api(`/api/dashboard/log?date=${prev}`).then(row => {
      if (cancelled) return;
      const text = row && !row.error ? String(row.tomorrow_task ?? "").trim() : "";
      setCarry({ date: prev, text });
    });
    return () => { cancelled = true; };
  }, [date]);

  // Debounced autosave — typing a reflection and tapping away no longer loses it.
  useEffect(() => {
    if (JSON.stringify(draft) === savedRef.current) return;
    setStatus("unsaved");
    const id = setTimeout(() => { void flush(); }, 900);
    return () => clearTimeout(id);
  }, [draft, flush]);

  // Last-chance saves: closing the app, or leaving this sub-tab.
  useEffect(() => {
    const beacon = () => {
      const snap = JSON.stringify(draftRef.current);
      if (snap === savedRef.current) return;
      if (isBlank(draftRef.current) && savedRef.current === JSON.stringify(EMPTY_DRAFT)) return;
      fetch("/api/dashboard/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateRef.current, ...draftRef.current }),
        keepalive: true,
      });
      savedRef.current = snap;
    };
    window.addEventListener("beforeunload", beacon);
    return () => { window.removeEventListener("beforeunload", beacon); beacon(); };
  }, []);

  const set = <K extends keyof LogDraft>(key: K, v: LogDraft[K]) =>
    setDraft(p => ({ ...p, [key]: v }));

  // Persist the day being left before switching — otherwise a pending debounce
  // would land on the newly picked date.
  const goto = async (next: string) => {
    if (next === dateRef.current) return;
    await flush();
    setDate(next);
  };

  const td = todayIn(tz);
  const isToday = date === td;

  return (
    <div className="flex flex-col gap-4">
      <DateNav date={date} today={td} onPick={goto} labels={d} />

      <CarryCard
        carry={carry}
        onOpenPrev={() => carry && void goto(carry.date)}
        labels={d}
      />

      <section>
        <SectionHeader
          eyebrow={d.reflection}
          trailing={<SaveStatus status={status} labels={d} onClick={() => void flush()} />}
        />
        <Card className="p-4 space-y-4">
          {[
            { key: "what_worked"   as const, q: d.q1, hint: d.q1Hint,  rows: 3 },
            { key: "tomorrow_task" as const, q: d.q2, hint: d.q2Hint,  rows: 2 },
            { key: "notes"         as const, q: d.notes, hint: undefined, rows: 2 },
          ].map(({ key, q, hint, rows }) => (
            <div key={key}>
              <label className="text-xs font-semibold block mb-0.5">{q}</label>
              {hint && (
                <div className="text-[10px] text-[var(--muted)] mb-1.5 leading-snug">{hint}</div>
              )}
              <Textarea
                value={draft[key]}
                onChange={e => set(key, e.target.value)}
                onBlur={() => void flush()}
                placeholder={key === "notes" ? d.notesPh : d.writePh}
                rows={rows}
                className={key === "tomorrow_task" ? "border-[var(--foreground)]/25" : undefined}
              />
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader eyebrow={d.workout} />
        <Card className="p-2">
          {([
            { key: "workout_pushups" as const, label: d.pushups, icon: Dumbbell,   step: 5,  unit: "" },
            { key: "workout_plank"   as const, label: d.plank,   icon: Timer,      step: 10, unit: "" },
            { key: "workout_walk"    as const, label: d.walk,    icon: Footprints, step: 5,  unit: "" },
          ]).map((row, idx) => (
            <CounterRow
              key={row.key}
              icon={row.icon}
              label={row.label}
              value={draft[row.key]}
              step={row.step}
              divider={idx > 0}
              onChange={v => set(row.key, v)}
              onCommit={() => void flush()}
            />
          ))}
        </Card>
      </section>

      <button
        onClick={() => void flush()}
        disabled={status === "saving"}
        className={[
          "w-full h-11 rounded-2xl text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50",
          status === "saved"
            ? "bg-emerald-500 text-white"
            : "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85",
        ].join(" ")}
      >
        {status === "saved" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {status === "saving" ? d.saving : status === "saved" ? d.saved : d.save}
      </button>

      <ExportLogs today={td} labels={d} />

      {!isToday && (
        <button
          onClick={() => void goto(td)}
          className="self-center text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] underline underline-offset-4 transition-colors cursor-pointer"
        >
          {d.backToToday}
        </button>
      )}
    </div>
  );
}

type LogLabels = ReturnType<typeof useLang>["t"]["dash"]["log"];

const EXPORT_RANGES = [7, 30, 90, 365] as const;

/**
 * Download the journal for a date range as Markdown.
 *
 * Inside Telegram the file has to come from an absolute HTTPS URL that the
 * native downloader can fetch without the session cookie, so the server mints a
 * short-lived signed link first and `saveFile` hands it to `downloadFile`
 * (Bot API 8.0+). In a normal browser it's just a download link.
 */
function ExportLogs({ today: td, labels }: { today: string; labels: LogLabels }) {
  const { lang } = useLang();
  const [days, setDays] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const from = shiftDate(td, -(days - 1));

  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const q = new URLSearchParams({ from, to: td, lang, link: "1" });
      const res = await api(`/api/dashboard/log/export?${q}`);
      if (res?.url) saveFile(res.url, res.filename ?? `journal-${from}_${td}.md`);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionHeader eyebrow={labels.exportTitle} />
      <Card className="p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-1 flex-wrap">
          {EXPORT_RANGES.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              aria-pressed={days === n}
              className={[
                "h-8 px-3 rounded-full text-[11px] font-semibold tabular-nums transition-all cursor-pointer",
                days === n
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {n === 365 ? labels.exportYear : `${n}${labels.exportDays}`}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-[var(--muted)] tabular-nums">{from} — {td}</div>

        <button
          onClick={() => void download()}
          disabled={busy}
          className="w-full h-10 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {labels.exportDownload}
        </button>

        {failed && <div className="text-[11px] text-red-500">{labels.exportFailed}</div>}
      </Card>
    </section>
  );
}

/** Day picker: arrows step ±1 day, the date itself opens the calendar. */
function DateNav({
  date, today: td, onPick, labels,
}: {
  date: string;
  today: string;
  onPick: (d: string) => void;
  labels: LogLabels;
}) {
  const { lang } = useLang();
  const locale = localeOf(lang);
  const atToday = date >= td;
  const human = new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    weekday: "long", day: "numeric", month: "long",
  });
  const rel = date === td ? labels.today
            : date === shiftDate(td, -1) ? labels.yesterday
            : null;

  return (
    <Card className="p-2">
      <div className="flex items-center gap-1">
        <IconButton
          size="lg"
          variant="ghost"
          onClick={() => onPick(shiftDate(date, -1))}
          aria-label={labels.prevDay}
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>

        {/* The calendar used to sit in its own button wedged between the date
            and the "next day" arrow, and its transparent <input type="date">
            overlay swallowed taps meant for that arrow — so going forward
            opened the picker instead. Now the date itself is the picker and the
            arrows own the edges, with nothing overlapping them. */}
        <label className="relative flex-1 min-w-0 text-center py-1.5 rounded-xl hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
          <div className="text-sm font-semibold capitalize truncate px-1">{human}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-0.5 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {rel ?? date}
          </div>
          <input
            type="date"
            value={date}
            max={td}
            onChange={e => e.target.value && onPick(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={labels.dateLabel}
          />
        </label>

        <IconButton
          size="lg"
          variant="ghost"
          onClick={() => onPick(shiftDate(date, 1))}
          disabled={atToday}
          className="disabled:opacity-25 disabled:cursor-not-allowed"
          aria-label={labels.nextDay}
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>
    </Card>
  );
}

/** Yesterday's "most important task for tomorrow", surfaced on the day it's for.
 *  Writing the intention and never seeing it again is how the habit dies. */
function CarryCard({
  carry, onOpenPrev, labels,
}: {
  carry: { date: string; text: string } | null;
  onOpenPrev: () => void;
  labels: LogLabels;
}) {
  const [added, setAdded] = useState(false);
  const [busy, setBusy]   = useState(false);
  useEffect(() => { setAdded(false); }, [carry?.date, carry?.text]);

  if (!carry) return null;

  if (!carry.text) {
    return (
      <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--muted)]">
        <Target className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">{labels.focusEmpty}</span>
      </div>
    );
  }

  const toTask = async () => {
    setBusy(true);
    const res = await jPost("/api/dashboard/todos", {
      text: carry.text, category: "general", priority: "high", status: "todo",
    });
    setBusy(false);
    if (res?.id) setAdded(true);
  };

  return (
    <Card className="p-4 border-[var(--foreground)]/25">
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-3.5 w-3.5 shrink-0 text-[var(--foreground)]" />
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
          {labels.focusTitle}
        </div>
      </div>
      <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{carry.text}</div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          onClick={() => void toTask()}
          disabled={busy || added}
          className={[
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition-all cursor-pointer",
            "disabled:cursor-default",
            added
              ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/25"
              : "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 disabled:opacity-50",
          ].join(" ")}
        >
          {added ? <Check className="h-3.5 w-3.5" /> : <ListPlus className="h-3.5 w-3.5" />}
          {added ? labels.focusAdded : labels.focusToTask}
        </button>
        <button
          onClick={onOpenPrev}
          className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] underline underline-offset-4 transition-colors cursor-pointer"
        >
          {labels.openPrev}
        </button>
      </div>
    </Card>
  );
}

/** −/+ stepper with a still-typeable number. Steppers beat a numeric keyboard
 *  on a phone; the raw input stays for "I did 47". */
function CounterRow({
  icon: Icon, label, value, step, divider, onChange, onCommit,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  step: number;
  divider: boolean;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const bump = (delta: number) => {
    onChange(Math.max(0, value + delta));
    onCommit();
  };
  return (
    <div className={[
      "flex items-center gap-2 px-2 py-2.5",
      divider ? "border-t border-[var(--card-border)]" : "",
    ].join(" ")}>
      <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      <span className="text-xs flex-1 min-w-0 truncate">{label}</span>
      <IconButton
        size="sm"
        variant="outline"
        onClick={() => bump(-step)}
        disabled={value <= 0}
        className="disabled:opacity-30"
        aria-label={`${label} −${step}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </IconButton>
      <input
        type="number"
        inputMode="numeric"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        onBlur={onCommit}
        className="w-14 shrink-0 bg-transparent text-center text-lg font-semibold tabular-nums outline-none border-b border-[var(--card-border)] focus:border-[var(--foreground)] transition-colors"
        aria-label={label}
      />
      <IconButton
        size="sm"
        variant="outline"
        onClick={() => bump(step)}
        aria-label={`${label} +${step}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

function SaveStatus({
  status, labels, onClick,
}: {
  status: "idle" | "saving" | "saved" | "unsaved";
  labels: LogLabels;
  onClick: () => void;
}) {
  if (status === "idle") return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer",
        status === "saved" ? "text-emerald-500"
          : status === "saving" ? "text-[var(--muted)]"
          : "text-yellow-500",
      ].join(" ")}
    >
      {status === "saving" ? <Loader2 className="h-3 w-3 animate-spin" />
        : status === "saved" ? <Check className="h-3 w-3" />
        : <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />}
      {status === "saving" ? labels.saving : status === "saved" ? labels.saved : labels.unsaved}
    </button>
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
  const { t, lang } = useLang();
  const locale = localeOf(lang);
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
                  {new Date(n.updated_at).toLocaleDateString(locale, { day: "numeric", month: "short" })}
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

const HISTORY_PERIODS = [7, 14, 30, 90] as const;

function HistoryContent() {
  const { t, lang } = useLang();
  const locale = localeOf(lang);
  const d = t.dash;
  const h = d.history;
  const { tz } = useTimezone();
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<HistoryData | null>(null);
  const td = todayIn(tz);

  // Send the window's end explicitly: the server's CURRENT_DATE is UTC and
  // would be a day behind the grid we draw here.
  useEffect(() => {
    setData(null);
    api(`/api/dashboard/history?days=${days}&end=${td}`).then(r => { if (!r.error) setData(r); });
  }, [td, days]);

  const dayList = getLast(days, tz);
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
    for (let i = dayList.length - 1; i >= 0; i--) {
      if (predicate(dayList[i])) streak++;
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
  const logsCount    = dayList.filter(dt => logsSet.has(dt)).length;

  // Cells keep a fixed width so a 90-day window scrolls sideways instead of
  // squeezing every square into an unreadable sliver.
  const cell = days > 31 ? 10 : 14;

  const Heatmap = (
    <div className="overflow-x-auto -mx-2 px-2">
      <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-[var(--card)] pr-2" style={{ minWidth: 84 }} />
            {dayList.map(dt => {
              // Parse at local midnight — `new Date("YYYY-MM-DD")` is UTC and
              // would render the previous day west of Greenwich.
              const local = new Date(`${dt}T00:00:00`);
              const isToday = dt === td;
              const first = local.getDate() === 1;
              return (
                <td key={dt} className="text-center pb-2" style={{ width: cell + 6 }}>
                  <div className="text-[8px] uppercase text-[var(--muted)] leading-none mb-0.5">
                    {days > 31
                      ? (first ? local.toLocaleDateString(locale, { month: "short" }) : "")
                      : local.toLocaleDateString(locale, { weekday: "narrow" })}
                  </div>
                  {days <= 31 && (
                    <div className={[
                      "text-[10px] tabular-nums font-medium",
                      isToday ? "text-[var(--foreground)] font-bold" : "text-[var(--muted)]",
                    ].join(" ")}>
                      {local.getDate()}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PRAYER_IDS.map(k => (
            <tr key={`p_${k}`}>
              <td className="sticky left-0 z-10 bg-[var(--card)] text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 py-1 truncate">
                {d.today.prayerNames[k]}
              </td>
              {dayList.map(dt => {
                const done = !!(habitsMap.get(dt) as unknown as Record<string, boolean> | undefined)?.[k];
                return (
                  <td key={dt} className="text-center py-0.5">
                    <div
                      className={["mx-auto rounded-[3px] transition-all", done ? "bg-[var(--foreground)]" : "bg-[var(--muted-bg)]"].join(" ")}
                      style={{ width: cell, height: cell }}
                      title={`${d.today.prayerNames[k]} · ${dt}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
          {defs.map((def, idx) => (
            <tr key={`h_${def.id}`}>
              <td className={[
                "sticky left-0 z-10 bg-[var(--card)] text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 py-1 truncate",
                idx === 0 ? "pt-3" : "",
              ].join(" ")}>{def.label || def.id}</td>
              {dayList.map(dt => {
                const done = isDone(def, dt);
                return (
                  <td key={dt} className="text-center py-0.5">
                    <div
                      className={["mx-auto rounded-[3px] transition-all", done ? "bg-[var(--foreground)]" : "bg-[var(--muted-bg)]"].join(" ")}
                      style={{ width: cell, height: cell }}
                      title={`${def.label || def.id} · ${dt}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 z-10 bg-[var(--card)] text-[10px] uppercase tracking-wide text-[var(--muted)] pr-2 pt-3">
              {h.log}
            </td>
            {dayList.map(dt => (
              <td key={dt} className="text-center pt-2">
                <div
                  className={[
                    "mx-auto rounded-[3px] border transition-all",
                    logsSet.has(dt)
                      ? "bg-[var(--foreground)] border-[var(--foreground)]"
                      : "border-[var(--card-border)]",
                  ].join(" ")}
                  style={{ width: cell, height: cell }}
                  title={`${h.log} · ${dt}`}
                />
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
          <StatBlock value={`${logsCount}/${days}`} label={h.logsLabel} />
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader
          eyebrow={h.window}
          className="mb-3"
          trailing={
            <div className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--surface)] p-1">
              {HISTORY_PERIODS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDays(n)}
                  aria-pressed={days === n}
                  className={[
                    "h-6 px-2 rounded-full text-[10px] font-semibold tabular-nums transition-all cursor-pointer",
                    days === n
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]",
                  ].join(" ")}
                >
                  {n}{h.dayShort}
                </button>
              ))}
            </div>
          }
        />
        {!data ? <HeatmapSkeleton /> : Heatmap}
      </Card>
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
