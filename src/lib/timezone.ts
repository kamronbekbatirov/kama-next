import { query } from "@/lib/db";

// Single source of truth for "what timezone is Kamronbek in". Stored in the
// settings table under key 'timezone' as { tz, auto }. The dashboard keeps it in
// sync with the device (auto mode) or pins it (manual). Server code — the bot /
// Claude — reads it here instead of hard-coding a city.
const DEFAULT_TZ = "Europe/London";

/**
 * `YYYY-MM-DD` for an instant as seen in `tz`. The server clock is UTC, so
 * `toISOString().slice(0,10)` is the previous day for anyone east of Greenwich
 * before their offset has elapsed — 00:00–05:00 in Tashkent, which is exactly
 * when the fajr habit gets ticked.
 */
export function isoDateIn(tz: string, instant: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(instant);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    const y = get("year"), m = get("month"), d = get("day");
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch { /* bad zone — fall through */ }
  return instant.toISOString().slice(0, 10);
}

/** Today's calendar date in the owner's configured timezone. */
export async function isoToday(instant: Date = new Date()): Promise<string> {
  return isoDateIn(await getTimezone(), instant);
}

export async function getTimezone(): Promise<string> {
  try {
    const rows = await query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key = 'timezone'",
    );
    const v = rows[0]?.value;
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && typeof (v as { tz?: unknown }).tz === "string") {
      const tz = (v as { tz: string }).tz;
      if (tz) return tz;
    }
  } catch { /* fall through to default */ }
  return DEFAULT_TZ;
}
