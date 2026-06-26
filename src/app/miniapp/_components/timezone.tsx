"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

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
  const [device, setDevice] = useState(deviceTz);
  const [auto, setAuto] = useState(true);
  const [stored, setStored] = useState<string | null>(null);
  const autoRef = useRef(true);                  // latest auto flag (for event handlers)
  const syncedRef = useRef<string | null>(null); // last tz pushed to the server in auto mode

  const save = useCallback((tz: string, autoFlag: boolean) => {
    syncedRef.current = autoFlag ? tz : null;
    fetch("/api/dashboard/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "timezone", value: { tz, auto: autoFlag } }),
    }).catch(() => { syncedRef.current = null; });
  }, []);

  // Load the saved setting; in auto mode push the device zone so the bot/Claude
  // get it automatically — no manual step.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/settings?key=timezone")
      .then(r => r.json())
      .then(({ value }) => {
        if (cancelled) return;
        const dev = deviceTz();
        setDevice(dev);
        const v = value && typeof value === "object" ? (value as { tz?: unknown; auto?: unknown }) : null;
        if (!v || typeof v.tz !== "string") {
          setAuto(true); autoRef.current = true; setStored(dev); save(dev, true);
          return;
        }
        const a = v.auto !== false;
        setAuto(a); autoRef.current = a;
        if (a) {
          setStored(dev);
          if (v.tz !== dev) save(dev, true);   // device moved → sync the bot
          else syncedRef.current = dev;
        } else {
          setStored(v.tz);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [save]);

  // While on auto, keep the server (and therefore the bot) in sync with the
  // device whenever the tab regains focus — catches a timezone change that
  // happened after the dashboard was first loaded.
  useEffect(() => {
    const resync = () => {
      if (!autoRef.current) return;
      const dev = deviceTz();
      setDevice(dev);
      if (dev !== syncedRef.current) save(dev, true);
    };
    const onVisible = () => { if (document.visibilityState === "visible") resync(); };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [save]);

  const setTimezone = useCallback((tz: string, autoFlag: boolean) => {
    const effective = autoFlag ? device : tz;
    autoRef.current = autoFlag;
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
