import * as adhan from "adhan";
import { query } from "@/lib/db";
import { getTimezone } from "@/lib/timezone";
import TZ_COORDS from "@/lib/tz-coords.json";

/**
 * Prayer times, computed locally.
 *
 * Not fetched from an API: the calculation is deterministic astronomy, and a
 * dashboard that shows prayer times should not stop showing them because
 * someone else's server is down. `adhan` implements the same standard
 * algorithms the published timetables use.
 *
 * The settings below were verified against islom.uz / muslim.uz for Tashkent:
 * Fajr 04:18, Asr 17:09, Isha 20:30 on 2026-08-26 — an exact match on all
 * three. The 3-minute additions on Fajr and Isha are the ihtiyat (precaution)
 * that official timetables apply to the two twilight prayers; Dhuhr, Asr and
 * Maghrib are taken from the sun's position with no margin.
 */

export const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

export interface PrayerConfig {
  /** Which timezone the stored coordinates belong to. */
  coordsTz: string;
  lat: number;
  lon: number;
  fajrAngle: number;
  ishaAngle: number;
  madhab: "hanafi" | "shafi";
  /** Whole-minute additions per prayer, as printed timetables apply. */
  adjust: Partial<Record<PrayerKey | "sunrise", number>>;
}

/** Tashkent, matching the published Uzbek timetable. */
export const DEFAULT_PRAYER_CONFIG: PrayerConfig = {
  coordsTz: "Asia/Tashkent",
  lat: 41.2995,
  lon: 69.2401,
  fajrAngle: 16,
  ishaAngle: 15,
  madhab: "hanafi",
  adjust: { fajr: 3, isha: 3 },
};

const COORDS = TZ_COORDS as Record<string, number[]>;

/** Representative coordinates for an IANA zone, from the tz database itself. */
export function coordsForTimezone(tz: string): { lat: number; lon: number } | null {
  const hit = COORDS[tz];
  return hit && hit.length === 2 ? { lat: hit[0], lon: hit[1] } : null;
}

export async function getPrayerConfig(): Promise<PrayerConfig> {
  const rows = await query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = 'prayer'",
  );
  const stored = (rows[0]?.value ?? {}) as Partial<PrayerConfig>;
  const cfg: PrayerConfig = { ...DEFAULT_PRAYER_CONFIG, ...stored };

  // Coordinates follow the timezone. Moving the dashboard to London has to
  // move the sun with it, or every time on the page becomes silently wrong —
  // and a wrong prayer time is worse than no prayer time. Hand-entered
  // coordinates are kept only while the zone they were entered for is current.
  const tz = await getTimezone();
  if (cfg.coordsTz !== tz) {
    const derived = coordsForTimezone(tz);
    if (derived) return { ...cfg, ...derived, coordsTz: tz };
  }
  return cfg;
}

export async function savePrayerConfig(patch: Partial<PrayerConfig>): Promise<PrayerConfig> {
  const next = { ...(await getPrayerConfig()), ...patch };
  await query(
    `INSERT INTO settings (key, value) VALUES ('prayer', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(next)],
  );
  return next;
}

function paramsFor(cfg: PrayerConfig, coords: adhan.Coordinates) {
  const p = adhan.CalculationMethod.Other();
  p.fajrAngle = cfg.fajrAngle;
  p.ishaAngle = cfg.ishaAngle;
  p.madhab = cfg.madhab === "shafi" ? adhan.Madhab.Shafi : adhan.Madhab.Hanafi;
  p.adjustments = { ...p.adjustments, ...cfg.adjust };
  // Above ~48° the sun never reaches the twilight angle in midsummer, so the
  // angle-based definition has no solution and the times come back invalid.
  // The recommended rule substitutes a night-fraction near the solstice.
  p.highLatitudeRule = adhan.HighLatitudeRule.recommended(coords);
  return p;
}

export interface DayPrayers {
  date: string;
  tz: string;
  lat: number;
  lon: number;
  /** Minutes from local midnight, so the UI can place them on its timeline. */
  times: Record<PrayerKey | "sunrise", { hhmm: string; min: number }>;
}

function localParts(d: Date, tz: string): { hhmm: string; min: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return { hhmm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, min: h * 60 + m };
}

/** `date` is an ISO calendar date in `tz`. */
export async function prayersForDay(date: string, tzIn?: string): Promise<DayPrayers> {
  const tz = tzIn ?? (await getTimezone());
  const cfg = await getPrayerConfig();
  const coords = new adhan.Coordinates(cfg.lat, cfg.lon);
  const [y, m, d] = date.split("-").map(Number);

  // Noon UTC on the calendar date: far enough from either midnight that no
  // timezone offset can land the library on the neighbouring day.
  const pt = new adhan.PrayerTimes(coords, new Date(Date.UTC(y, m - 1, d, 12)), paramsFor(cfg, coords));

  const times = {} as DayPrayers["times"];
  for (const k of [...PRAYER_KEYS, "sunrise"] as const) {
    times[k] = localParts(pt[k], tz);
  }
  return { date, tz, lat: cfg.lat, lon: cfg.lon, times };
}
