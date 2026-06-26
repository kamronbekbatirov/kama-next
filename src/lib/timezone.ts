import { query } from "@/lib/db";

// Single source of truth for "what timezone is Kamronbek in". Stored in the
// settings table under key 'timezone' as { tz, auto }. The dashboard keeps it in
// sync with the device (auto mode) or pins it (manual). Server code — the bot /
// Claude — reads it here instead of hard-coding a city.
const DEFAULT_TZ = "Europe/London";

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
