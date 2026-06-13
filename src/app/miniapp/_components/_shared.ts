"use client";

import { useCallback, useEffect, useState } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
export type TodoStatus = "todo" | "doing" | "done";
export interface Todo {
  id: number;
  text: string;
  description: string | null;
  done: boolean;
  category: string;
  priority: string;
  status: TodoStatus;
  position: number;
  archived: boolean;
  due_at: string | null;
}
export const TODO_STATUSES: readonly TodoStatus[] = ["todo", "doing", "done"];
export interface Application { id: number; company: string; role: string; status: string; notes: string | null; }
export interface BudgetEntry { id: number; type: "income" | "expense"; amount: number; category: string | null; description: string | null; date: string; }
export interface DailyLog { date: string; visa_progress: string|null; what_worked: string|null; tomorrow_task: string|null; workout_pushups: number; workout_plank: number; workout_walk: number; notes: string|null; }
export interface HabitsRow { date: string; fajr: boolean; dhuhr: boolean; asr: boolean; maghrib: boolean; isha: boolean; water: boolean; walk: boolean; workout: boolean; breakfast: boolean; quran: boolean; }
export interface Note { id: number; title: string; content: string; updated_at: string; }
export interface ScheduleBlock { id: string; start: number; end: number; label: string; icon: string; }
export interface HabitDef { id: string; label: string; builtin: boolean; }
export interface Subscription { id: string; name: string; amount: number; currency: string; day: number; active: boolean; }

// ─── DEFAULTS ────────────────────────────────────────────────────────────────
// Icons are lucide keys (see @/lib/schedule-icons). The live default schedule is
// seeded server-side in app/api/dashboard/schedule/route.ts.
export const DEFAULT_SCHEDULE: ScheduleBlock[] = [
  { id: "s_fajr",      start: 420,  end: 450,  label: "Фаджр + Коран",       icon: "night" },
  { id: "s_walk",      start: 450,  end: 480,  label: "Утренняя прогулка",    icon: "walk" },
  { id: "s_workout",   start: 480,  end: 510,  label: "Домашняя тренировка",  icon: "dumbbell" },
  { id: "s_breakfast", start: 510,  end: 540,  label: "Завтрак",              icon: "breakfast" },
  { id: "s_work",      start: 540,  end: 780,  label: "Основная работа",      icon: "laptop" },
  { id: "s_lunch",     start: 780,  end: 840,  label: "Обед + Зухр",          icon: "meal" },
  { id: "s_comms",     start: 840,  end: 900,  label: "Коммуникации",         icon: "chat" },
  { id: "s_skills",    start: 900,  end: 960,  label: "Навыки",               icon: "book" },
  { id: "s_freelance", start: 960,  end: 1080, label: "Фриланс",              icon: "briefcase" },
  { id: "s_evening",   start: 1080, end: 1200, label: "Вечерняя рутина",      icon: "moon" },
  { id: "s_isha",      start: 1200, end: 1320, label: "Рефлексия + Иша",      icon: "pray" },
];

export const BUILTIN_IDS = ["water", "walk", "workout", "breakfast", "quran"] as const;
export const PRAYER_IDS  = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

export const STATUS_TONE: Record<string, "outline" | "default" | "success" | "warning" | "danger"> = {
  applied:   "outline",
  screening: "default",
  interview: "warning",
  offer:     "success",
  rejected:  "danger",
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
export function today() { return new Date().toISOString().slice(0, 10); }
export function fmtMin(m: number) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }
export function parseTime(s: string) { const [h,m] = s.split(":").map(Number); return isNaN(h)||isNaN(m) ? null : h*60+m; }
export function getLast(n: number): string[] {
  return Array.from({length: n}, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

// ─── DUE DATE HELPERS ────────────────────────────────────────────────────────
// `<input type="datetime-local">` works in the browser's local wall-clock with
// no timezone. We store a UTC instant (TIMESTAMPTZ) and convert on both sides so
// a due time set in London reads back as London regardless of the server's TZ.
function pad2(n: number) { return String(n).padStart(2, "0"); }

/** Stored ISO/UTC timestamp → value for a datetime-local input (local clock). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** datetime-local value (local clock) → UTC ISO string for storage (or null). */
export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local); // a time-only string with no offset is parsed as local time
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Short, locale-aware label for a due date, in the viewer's tz. */
export function fmtDue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

// ─── API HELPERS ─────────────────────────────────────────────────────────────
export async function api(url: string, opts?: RequestInit) { return fetch(url, opts).then(r => r.json()); }
export function jPost(url: string, b: object) { return api(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}); }
export function jPatch(url: string, b: object) { return api(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}); }
export function jDel(url: string, b: object) { return api(url,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}); }

// ─── LOCAL STORAGE HOOK ──────────────────────────────────────────────────────
export function useLS<T>(key: string, def: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(def);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s !== null) setVal(JSON.parse(s)); } catch {} }, [key]);
  const set = useCallback((v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key]);
  return [val, set];
}

// ─── HASH SUB-VIEW PERSISTENCE ───────────────────────────────────────────────
// The URL hash is `#<tab>` or `#<tab>/<sub>` (e.g. "#server/inbox"). The main
// nav owns the first segment; sub-tabbed panes own the second via useHashView,
// so reloading keeps you on the same pane. The hash is client-only (never sent
// to the server), so this is purely a UX nicety with no security impact.
function getHashSub(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.hash.replace(/^#/, "").split("/");
  return parts[1] || null;
}

export function useHashView(
  tab: string,
  valid: readonly string[],
  fallback: string,
): [string, (v: string) => void] {
  const [view, setView] = useState<string>(fallback);
  useEffect(() => {
    const sync = () => {
      const sub = getHashSub();
      setView(sub && valid.includes(sub) ? sub : fallback);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // `valid` is a stable literal at each call site; tab/fallback are constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fallback]);
  const set = useCallback((v: string) => {
    setView(v);
    if (typeof window !== "undefined") {
      const target = `#${tab}/${v}`;
      if (window.location.hash !== target) history.replaceState(null, "", target);
    }
  }, [tab]);
  return [view, set];
}
