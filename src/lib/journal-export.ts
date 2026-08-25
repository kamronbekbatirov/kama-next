import { query } from "@/lib/db";
import { translations, type Lang } from "@/lib/i18n";

const LOCALES: Record<Lang, string> = { en: "en-GB", ru: "ru-RU", uz: "uz-Cyrl-UZ" };

export interface JournalRow {
  date: string;
  what_worked: string | null;
  tomorrow_task: string | null;
  visa_progress: string | null;
  notes: string | null;
  workout_pushups: number | null;
  workout_plank: number | null;
  workout_walk: number | null;
}

/**
 * A day counts as "logged" only if something was actually written. The upsert
 * keeps the row when the form is cleared, so existence alone would report an
 * emptied day as filled — in the history grid and in an export alike.
 */
const HAS_CONTENT = `(
  COALESCE(TRIM(what_worked), '')   <> '' OR
  COALESCE(TRIM(tomorrow_task), '') <> '' OR
  COALESCE(TRIM(notes), '')         <> '' OR
  COALESCE(TRIM(visa_progress), '') <> '' OR
  COALESCE(workout_pushups, 0) > 0 OR
  COALESCE(workout_plank, 0)   > 0 OR
  COALESCE(workout_walk, 0)    > 0
)`;

/** Journal entries with content in `[from, to]`, newest first. */
export async function fetchJournal(from: string, to: string): Promise<JournalRow[]> {
  return query<JournalRow>(
    `SELECT date::text AS date, what_worked, tomorrow_task, visa_progress, notes,
            workout_pushups, workout_plank, workout_walk
       FROM daily_log
      WHERE date >= $1::date AND date <= $2::date AND ${HAS_CONTENT}
      ORDER BY date DESC`,
    [from, to],
  );
}

/** Markdown document for a range — the same bytes whether the dashboard
 *  downloads it or the bot sends it as a Telegram attachment. */
export function renderJournalMarkdown(
  rows: JournalRow[], from: string, to: string, lang: Lang,
): string {
  const t = translations[lang].dash.log;
  const locale = LOCALES[lang];
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

  const out: string[] = [
    // U+FEFF byte-order mark. The bytes are UTF-8 either way, but a bare .md
    // carries no encoding metadata, so a phone's text viewer falls back to the
    // system codepage and Cyrillic arrives as "Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ°". The BOM is the
    // only in-band signal that survives being saved to disk; Markdown parsers
    // ignore it.
    `\uFEFF# ${translations[lang].dash.tabs.log} · ${from} — ${to}`,
    "",
    `_${translations[lang].dash.history.logsLabel}: ${rows.length}_`,
    "",
  ];

  for (const r of rows) {
    out.push(`## ${r.date} · ${day(r.date)}`, "");
    const field = (label: string, value: string | null) => {
      const v = value?.trim();
      if (!v) return;
      out.push(`**${label}**`, "", v, "");
    };
    field(t.q1, r.what_worked);
    field(t.q2, r.tomorrow_task);
    field(t.q3, r.visa_progress);
    field(t.notes, r.notes);

    const w = [
      r.workout_pushups ? `${t.pushups}: ${r.workout_pushups}` : null,
      r.workout_plank   ? `${t.plank}: ${r.workout_plank}`     : null,
      r.workout_walk    ? `${t.walk}: ${r.workout_walk}`       : null,
    ].filter(Boolean);
    if (w.length) out.push(`**${t.workout}** — ${w.join(" · ")}`, "");

    out.push("---", "");
  }

  return out.join("\n");
}

/** Compact plain-text rendering for the chat context (no Markdown noise). */
export function renderJournalPlain(rows: JournalRow[]): string {
  if (rows.length === 0) return "(no entries with content in that range)";
  return rows
    .map(r => {
      const parts = [
        r.what_worked?.trim()   ? `worked: ${r.what_worked.trim()}` : null,
        r.tomorrow_task?.trim() ? `tomorrow: ${r.tomorrow_task.trim()}` : null,
        r.visa_progress?.trim() ? `visa: ${r.visa_progress.trim()}` : null,
        r.notes?.trim()         ? `notes: ${r.notes.trim()}` : null,
        (r.workout_pushups || r.workout_plank || r.workout_walk)
          ? `workout: ${r.workout_pushups ?? 0}p/${r.workout_plank ?? 0}s/${r.workout_walk ?? 0}min`
          : null,
      ].filter(Boolean);
      return `- ${r.date}: ${parts.join(" · ") || "(empty)"}`;
    })
    .join("\n");
}
