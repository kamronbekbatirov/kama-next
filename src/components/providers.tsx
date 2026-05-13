"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { translations } from "@/lib/i18n";

// ─── Telegram theme sync + init ────────────────────────────
//
// The Telegram Web App SDK is loaded via <Script strategy="beforeInteractive">
// in miniapp/layout.tsx, but with `beforeInteractive` Next still defers it
// slightly. We poll briefly to make sure window.Telegram.WebApp is there
// before calling expand/disableVerticalSwipes/requestFullscreen, otherwise
// the calls silently no-op (which is why "swipe is still enabled" looked
// like nothing happened).
function TelegramThemeSync() {
  const { setTheme } = useTheme();
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const init = () => {
      type TGWebApp = {
        ready?: () => void;
        expand?: () => void;
        disableVerticalSwipes?: () => void;
        requestFullscreen?: () => void;
        onEvent?: (e: string, fn: () => void) => void;
        offEvent?: (e: string, fn: () => void) => void;
        isVersionAtLeast?: (v: string) => boolean;
        platform?: string;
        colorScheme?: string;
        initData?: string;
      };
      const tg = (window as unknown as { Telegram?: { WebApp?: TGWebApp } }).Telegram?.WebApp;
      if (!tg) return false;

      tg.ready?.();

      // "in Telegram" = platform is set to something other than "unknown".
      // initData can be empty for valid Telegram sessions, so don't rely on it.
      const inTelegram = !!tg.platform && tg.platform !== "unknown";

      if (inTelegram) {
        // 1. Expand to full height (Bot API ≤7.6 needs this; 7.7+ does it
        //    automatically but the call is still safe).
        tg.expand?.();

        // 2. Block swipe-down-to-close gesture (Bot API 7.7+).
        if (tg.isVersionAtLeast?.("7.7")) {
          try { tg.disableVerticalSwipes?.(); } catch { /* ignore */ }
        }

        // 3. Edge-to-edge fullscreen (Bot API 8.0+). On older clients
        //    expand() above already gives full available height.
        if (tg.isVersionAtLeast?.("8.0")) {
          try { tg.requestFullscreen?.(); } catch { /* ignore */ }
        }

        // 4. Theme follow
        const applyTheme = () => {
          if (!localStorage.getItem("kama_theme_manual")) {
            setTheme(tg.colorScheme === "dark" ? "dark" : "light");
          }
        };
        applyTheme();
        if (tg.onEvent && tg.offEvent) {
          tg.onEvent("themeChanged", applyTheme);
          cleanup = () => tg.offEvent?.("themeChanged", applyTheme);
        }
      } else {
        // Regular browser — follow OS theme unless user toggled manually.
        if (!localStorage.getItem("kama_theme_manual")) {
          setTheme("system");
        }
      }
      return true;
    };

    if (!init()) {
      // SDK not loaded yet — poll for up to ~3s (60 × 50ms).
      let attempts = 0;
      const timerId = setInterval(() => {
        if (cancelled || init() || ++attempts >= 60) {
          clearInterval(timerId);
        }
      }, 50);
      // Cleanup in case the component unmounts before SDK arrives
      const prevCleanup = cleanup;
      cleanup = () => {
        clearInterval(timerId);
        prevCleanup?.();
      };
    }

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [setTheme]);
  return null;
}

// ─── Lang Context ─────────────────────────────────────────
interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof translations.en;
}

const LangContext = createContext<LangContextType>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export function useLang() {
  return useContext(LangContext);
}

function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("kama_lang") as Lang | null;
    if (saved && ["en", "ru", "uz"].includes(saved)) setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("kama_lang", l);
  }

  const value = useMemo(() => ({ lang, setLang, t: translations[lang] }), [lang]);

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

// ─── Root Providers ───────────────────────────────────────
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
      <TelegramThemeSync />
      <LangProvider>{children}</LangProvider>
    </ThemeProvider>
  );
}
