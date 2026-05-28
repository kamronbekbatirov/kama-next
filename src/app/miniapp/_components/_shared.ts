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
export const DEFAULT_SCHEDULE: ScheduleBlock[] = [
  { id: "s_fajr",      start: 420,  end: 450,  label: "Фаджр + Коран",       icon: "🕌" },
  { id: "s_walk",      start: 450,  end: 480,  label: "Утренняя прогулка",    icon: "🚶" },
  { id: "s_workout",   start: 480,  end: 510,  label: "Домашняя тренировка",  icon: "💪" },
  { id: "s_breakfast", start: 510,  end: 540,  label: "Завтрак",              icon: "🍳" },
  { id: "s_work",      start: 540,  end: 780,  label: "Основная работа",      icon: "💻" },
  { id: "s_lunch",     start: 780,  end: 840,  label: "Обед + Зухр",          icon: "🍽️" },
  { id: "s_comms",     start: 840,  end: 900,  label: "Коммуникации",         icon: "💬" },
  { id: "s_skills",    start: 900,  end: 960,  label: "Навыки",               icon: "📚" },
  { id: "s_freelance", start: 960,  end: 1080, label: "Фриланс",              icon: "💼" },
  { id: "s_evening",   start: 1080, end: 1200, label: "Вечерняя рутина",      icon: "🌙" },
  { id: "s_isha",      start: 1200, end: 1320, label: "Рефлексия + Иша",      icon: "🤲" },
];

export const PRESET_ICONS = [
  // sky / energy
  "🌅","☀️","🌙","🌃","⭐","✨","⚡","🔥",
  // work / study
  "💼","💻","📚","🎓","🧠","💡","📝","🎯",
  // body / movement
  "💪","🏃","🚶","🧘","🚴","🏋️","⚽","🛌",
  // food / life
  "🍳","🍽️","☕","💧","🛒","💰","💬","📞",
  // spiritual / misc
  "🕌","🤲","📿","🌳","🎵","🎨","✅","❤️",
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
