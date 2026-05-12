"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { translations } from "@/lib/i18n";

// ─── Telegram theme sync + init ────────────────────────────
function TelegramThemeSync() {
  const { setTheme } = useTheme();
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    // initData is non-empty only when actually launched inside a Telegram Mini App.
    // The SDK script loads on all pages, so `tg` exists everywhere — initData is the
    // reliable signal that we're genuinely inside Telegram.
    const inTelegram = Boolean(tg?.initData);

    if (inTelegram) {
      tg.ready?.();
      tg.expand?.();
      tg.disableVerticalSwipes?.();

      // Bot API 8.0+: ask for true fullscreen. Falls back to expand() on
      // older clients (already called above), so this is purely additive.
      if (typeof tg.isVersionAtLeast === "function" && tg.isVersionAtLeast("8.0")) {
        try { tg.requestFullscreen?.(); } catch { /* ignore */ }
      }

      if (!localStorage.getItem("kama_theme_manual")) {
        setTheme(tg.colorScheme === "dark" ? "dark" : "light");
      }
      const handler = () => {
        if (!localStorage.getItem("kama_theme_manual")) {
          setTheme(tg.colorScheme === "dark" ? "dark" : "light");
        }
      };
      tg.onEvent("themeChanged", handler);
      return () => tg.offEvent("themeChanged", handler);
    } else {
      // Regular browser — always follow OS preference unless the user manually toggled
      if (!localStorage.getItem("kama_theme_manual")) {
        setTheme("system");
      }
    }
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
