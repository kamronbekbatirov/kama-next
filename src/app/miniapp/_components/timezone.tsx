"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

function deviceTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

interface TzValue {
  tz: string;        // effective timezone to render with
  auto: boolean;     // follow the device automatically
  device: string;    // the device's current timezone
  setTimezone: (tz: string, auto: boolean) => void;
}

const TzContext = createContext<TzValue>({ tz: "UTC", auto: true, device: "UTC", setTimezone: () => {} });

export const useTimezone = () => useContext(TzContext);

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [device] = useState(deviceTz);
  const [auto, setAuto] = useState(true);
  const [stored, setStored] = useState<string | null>(null);

  const save = useCallback((tz: string, autoFlag: boolean) => {
    fetch("/api/dashboard/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "timezone", value: { tz, auto: autoFlag } }),
    }).catch(() => {});
  }, []);

  // Load the saved setting; in auto mode keep the server synced to the device so
  // the bot/Claude always know the right zone.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/settings?key=timezone")
      .then(r => r.json())
      .then(({ value }) => {
        if (cancelled) return;
        const v = value && typeof value === "object" ? (value as { tz?: unknown; auto?: unknown }) : null;
        if (!v || typeof v.tz !== "string") {
          setAuto(true); setStored(device); save(device, true);
          return;
        }
        const a = v.auto !== false;
        setAuto(a);
        if (a && v.tz !== device) { setStored(device); save(device, true); }
        else setStored(v.tz);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [device, save]);

  const setTimezone = useCallback((tz: string, autoFlag: boolean) => {
    const effective = autoFlag ? device : tz;
    setAuto(autoFlag);
    setStored(effective);
    save(effective, autoFlag);
  }, [device, save]);

  const tz = auto ? device : (stored ?? device);
  return <TzContext.Provider value={{ tz, auto, device, setTimezone }}>{children}</TzContext.Provider>;
}

// ── tz-aware formatting ──────────────────────────────────────────────────────
export function clockParts(instant: Date, tz: string): { h: number; m: number; s: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(instant);
    const g = (t: string) => Number(parts.find(p => p.type === t)?.value ?? "0");
    let h = g("hour"); if (h === 24) h = 0; // some engines emit 24 at midnight
    return { h, m: g("minute"), s: g("second") };
  } catch {
    return { h: instant.getHours(), m: instant.getMinutes(), s: instant.getSeconds() };
  }
}

export function dateLabel(instant: Date, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  try { return new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(instant); }
  catch { return instant.toLocaleDateString(locale, opts); }
}

// The list of IANA zones for the manual picker (falls back to a short list on
// engines without Intl.supportedValuesOf).
export function allTimeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn("timeZone");
  } catch { /* ignore */ }
  return [
    "UTC", "Europe/London", "Europe/Moscow", "Asia/Tashkent", "Asia/Dubai",
    "Asia/Almaty", "Asia/Istanbul", "America/New_York", "America/Los_Angeles",
    "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
  ];
}
