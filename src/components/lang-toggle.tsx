"use client";

import { useLang } from "@/components/providers";
import type { Lang } from "@/lib/i18n";
import { useState } from "react";
import { cn } from "@/lib/utils";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ru", label: "RU" },
  { code: "uz", label: "UZ" },
];

export function LangToggle() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "h-9 px-3 rounded-lg text-xs font-semibold border border-[var(--card-border)]",
          "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
        )}
      >
        {lang.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 rounded-lg border border-[var(--card-border)] bg-[var(--card)] shadow-lg overflow-hidden min-w-[80px]">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={cn(
                "w-full px-4 py-2 text-xs font-semibold text-left cursor-pointer hover:bg-[var(--muted-bg)] transition-colors",
                lang === l.code ? "text-[var(--foreground)] bg-[var(--muted-bg)]" : "text-[var(--muted)]"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
