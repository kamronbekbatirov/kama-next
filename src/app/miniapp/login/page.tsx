"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { useLang } from "@/components/providers";

export default function LoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [tgStatus, setTgStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData) {
      setTgStatus("loading");
      fetch("/api/auth/tg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: tg.initData }),
      })
        .then(r => r.json())
        .then(d => { if (d.ok) router.replace("/miniapp"); else setTgStatus("error"); })
        .catch(() => setTgStatus("error"));
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const d = await res.json();
    if (d.ok) { setStatus("success"); router.replace("/miniapp"); }
    else { setStatus("error"); setTimeout(() => setStatus("idle"), 2000); }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <div className="fixed top-4 right-4 flex items-center gap-1 z-10">
        <ThemeToggle />
        <LangToggle />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Logo */}
        <div className="mb-14 text-center">
          <div className="w-14 h-14 border border-[var(--foreground)] flex items-center justify-center mx-auto mb-5">
            <span className="font-black text-2xl">K</span>
          </div>
          <h1 className="font-black text-sm uppercase tracking-[0.2em]">{t.login.title}</h1>
          <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mt-1">Kamronbek Batirov</p>
        </div>

        {tgStatus === "loading" ? (
          <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] animate-pulse">{t.login.tgNote}</p>
        ) : tgStatus === "error" ? (
          <p className="text-[10px] uppercase tracking-widest text-red-500 font-bold">{t.login.tgError}</p>
        ) : (
          <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-2">
                {t.login.password}
              </label>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder={t.login.placeholder}
                autoFocus
                autoComplete="current-password"
                className="w-full h-11 px-4 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors"
              />
            </div>
            {status === "error" && (
              <p className="text-[10px] uppercase tracking-widest text-red-500 font-bold text-center">{t.login.error}</p>
            )}
            <button
              type="submit"
              disabled={status === "loading" || status === "success" || !pw}
              className="w-full h-11 bg-[var(--foreground)] text-[var(--background)] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-75 transition-opacity disabled:opacity-30"
            >
              {status === "loading" ? t.login.submitting : status === "success" ? t.login.success : t.login.submit}
            </button>
          </form>
        )}
      </div>

      <div className="text-center" style={{ padding: "20px 0 max(20px, env(safe-area-inset-bottom, 0px))" }}>
        <a href="/" className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          ← kama.uz
        </a>
      </div>
    </div>
  );
}
