"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useLang } from "@/components/providers";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { ArrowDownRight, Github, Linkedin, Mail } from "lucide-react";

// ─── CONTACT FORM ──────────────────────────────────────────
function ContactForm() {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });
    setStatus(res.ok ? "success" : "error");
    if (res.ok) { setName(""); setEmail(""); setMessage(""); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold mb-2 uppercase tracking-[0.15em] text-[var(--muted)]">
            {t.contact.name}
          </label>
          <input
            required value={name} onChange={e => setName(e.target.value)}
            placeholder={t.contact.namePlaceholder}
            className="w-full h-11 px-4 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--card-border)]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold mb-2 uppercase tracking-[0.15em] text-[var(--muted)]">
            {t.contact.email}
          </label>
          <input
            required type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={t.contact.emailPlaceholder}
            className="w-full h-11 px-4 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--card-border)]"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold mb-2 uppercase tracking-[0.15em] text-[var(--muted)]">
          {t.contact.message}
        </label>
        <textarea
          required rows={5} value={message} onChange={e => setMessage(e.target.value)}
          placeholder={t.contact.messagePlaceholder}
          className="w-full px-4 py-3 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors resize-none placeholder:text-[var(--card-border)]"
        />
      </div>
      {status === "success" && (
        <p className="text-xs uppercase tracking-widest text-emerald-500 font-bold">{t.contact.success}</p>
      )}
      {status === "error" && (
        <p className="text-xs uppercase tracking-widest text-red-500 font-bold">{t.contact.errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "sending" || status === "success"}
        className="h-11 px-8 bg-[var(--foreground)] text-[var(--background)] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-75 transition-opacity disabled:opacity-30"
      >
        {status === "sending" ? t.contact.sending : t.contact.send}
      </button>
    </form>
  );
}

// ─── DATA ──────────────────────────────────────────────────
const TICKER = [
  "Python", "TypeScript", "Next.js", "PostgreSQL",
  "Linux", "DevOps", "Telegram API", "Machine Learning",
  "REST APIs", "React", "Node.js", "Git",
];

// ─── PAGE ──────────────────────────────────────────────────
export default function PortfolioPage() {
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<number | null>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;
    let pos = 0;
    let raf: number;
    function tick() {
      pos += 0.6;
      const half = el!.scrollWidth / 2;
      if (pos >= half) pos -= half;
      el!.style.transform = `translateX(-${pos}px)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const NAV_LINKS = [
    { href: "#work", label: t.nav.projects },
    { href: "#experience", label: t.nav.experience },
    { href: "#contact", label: t.nav.contact },
  ];

  const projects = t.projects.items.map((p, i) => ({
    ...p,
    num: `0${i + 1}`,
    status: [t.projects.live, t.projects.live, t.projects.wip, t.projects.grade][i],
    dot: ["bg-emerald-500", "bg-emerald-500", "bg-amber-400", "bg-[var(--foreground)]"][i],
  }));

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      {/* ── NAV ───────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
          <a href="#" className="mr-auto">
            <span className="font-black text-sm uppercase tracking-tight">Kamronbek</span>
            <span className="font-light text-sm text-[var(--muted)] hidden sm:inline"> Batirov</span>
          </a>
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href}
                className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LangToggle />
          </div>
          <a href="mailto:hi@kama.uz"
            className="hidden md:flex h-8 px-4 items-center bg-[var(--foreground)] text-[var(--background)] text-[10px] font-black uppercase tracking-[0.15em] hover:opacity-75 transition-opacity">
            {t.nav.hire}
          </a>
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-[10px] uppercase tracking-widest font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            {menuOpen ? "✕" : "Menu"}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-[var(--card-border)] px-6 py-6 space-y-4 bg-[var(--background)]">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                className="block text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--muted)] hover:text-[var(--foreground)] py-1 transition-colors">
                {l.label}
              </a>
            ))}
            <a href="mailto:hi@kama.uz"
              className="inline-flex h-9 px-5 items-center bg-[var(--foreground)] text-[var(--background)] text-[10px] font-black uppercase tracking-[0.15em] mt-2">
              {t.nav.hire}
            </a>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col justify-center px-6 pt-14">
        <div className="max-w-6xl mx-auto w-full py-16">

          {/* Top label row */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">
              Full-Stack Developer
            </span>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">
                London, UK · Available
              </span>
            </div>
          </div>

          {/* Rule */}
          <div className="w-full h-px bg-[var(--card-border)]" />

          {/* Giant name */}
          <h1
            className="font-black uppercase leading-[0.85] tracking-tighter mt-6"
            style={{ fontSize: "clamp(2.6rem, 13vw, 11rem)" }}
          >
            {t.hero.title1}
            <br />
            <em className="not-italic text-[var(--muted)]">{t.hero.title2}</em>
          </h1>

          {/* Rule */}
          <div className="w-full h-px bg-[var(--card-border)] mt-6 mb-5" />

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <p className="text-sm text-[var(--muted)] max-w-md leading-relaxed">
              {t.hero.sub}
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <a href="#work"
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-black border border-[var(--card-border)] h-10 px-5 hover:bg-[var(--muted-bg)] transition-colors">
                {t.hero.viewProjects} <ArrowDownRight size={12} />
              </a>
              <a href="mailto:hi@kama.uz"
                className="flex items-center h-10 px-5 bg-[var(--foreground)] text-[var(--background)] text-[10px] uppercase tracking-[0.18em] font-black hover:opacity-75 transition-opacity">
                hi@kama.uz
              </a>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-[var(--card-border)] mt-14 divide-x divide-[var(--card-border)]">
            {[
              { v: "4+",  l: t.hero.stats.projects },
              { v: "3",   l: t.hero.stats.languages },
              { v: "2:1", l: t.hero.stats.degree },
              { v: "A+",  l: t.hero.stats.dissertation },
            ].map((s, i) => (
              <div key={i} className="py-6 px-5 text-center">
                <div className="text-3xl font-black leading-none">{s.v}</div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mt-2 font-bold">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER ────────────────────────────────────── */}
      <div className="border-y border-[var(--card-border)] py-3.5 overflow-hidden select-none">
        <div ref={marqueeRef} className="marquee-track">
          {[TICKER, TICKER].map((group, gi) => (
            <div key={gi} className="marquee-group" aria-hidden={gi === 1}>
              {group.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-6 mx-6 text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--muted)]">
                  {s}
                  <span className="text-[var(--card-border)] text-[8px]">◆</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── SELECTED WORK ─────────────────────────────── */}
      <section id="work" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">{t.projects.tag}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">2023 – 2025</span>
          </div>
          <h2 className="text-4xl font-black uppercase tracking-tight mb-0">{t.projects.title}</h2>

          <div className="mt-8 border-t border-[var(--card-border)]">
            {projects.map((p, i) => (
              <div
                key={p.name}
                className="group relative border-b border-[var(--card-border)] overflow-hidden cursor-default"
                onMouseEnter={() => setHoveredProject(i)}
                onMouseLeave={() => setHoveredProject(null)}
              >
                {/* Slide-in fill */}
                <div className="absolute inset-0 bg-[var(--foreground)] -translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out pointer-events-none" />

                <div className="relative z-10 flex items-start gap-6 py-6 px-4 sm:py-5 sm:px-6 sm:items-center">
                  {/* Number */}
                  <span className="text-[10px] font-black text-[var(--muted)] group-hover:text-[var(--background)]/50 transition-colors pt-0.5 sm:pt-0 w-5 shrink-0">
                    {p.num}
                  </span>

                  {/* Name + desc */}
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-xl sm:text-2xl leading-tight group-hover:text-[var(--background)] transition-colors">
                      {p.name}
                    </div>
                    <div className={cn(
                      "text-sm text-[var(--muted)] group-hover:text-[var(--background)]/60 transition-colors leading-relaxed mt-1",
                      "max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100",
                      "transition-all duration-300"
                    )}>
                      {p.desc}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("h-1.5 w-1.5 rounded-full group-hover:bg-[var(--background)] transition-colors", p.dot)} />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--muted)] group-hover:text-[var(--background)] transition-colors">
                      {p.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EXPERIENCE ────────────────────────────────── */}
      <section id="experience" className="py-24 px-6 border-t border-[var(--card-border)]">
        <div className="max-w-6xl mx-auto">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">{t.experience.tag}</span>
          <h2 className="text-4xl font-black uppercase tracking-tight mt-1 mb-12">{t.experience.title}</h2>

          <div className="border-t border-[var(--card-border)]">
            {t.experience.items.map((e, i) => (
              <div key={i} className="grid md:grid-cols-[220px_1fr] gap-2 md:gap-8 py-8 border-b border-[var(--card-border)]">
                <div className="pt-0.5">
                  <div className="text-[10px] uppercase tracking-[0.15em] font-black">{e.date}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] mt-1 font-medium">{e.company}</div>
                </div>
                <div>
                  <div className="font-black text-lg">{e.title}</div>
                  <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT ─────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-[var(--card-border)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">{t.about.tag}</span>
              <h2 className="text-4xl font-black uppercase tracking-tight mt-1 mb-8">{t.about.title}</h2>
              <div className="space-y-4 text-sm text-[var(--muted)] leading-relaxed">
                <p>{t.about.p1}</p>
                <p>{t.about.p2}</p>
                <p>{t.about.p3}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[var(--card-border)] border border-[var(--card-border)]">
              {t.about.cards.map((c, i) => (
                <div key={c} className="p-6">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-2">{c}</div>
                  <div className="text-sm font-black">{t.about.cardVals[i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ───────────────────────────────────── */}
      <section id="contact" className="py-24 px-6 border-t border-[var(--card-border)]">
        <div className="max-w-6xl mx-auto">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">{t.contact.tag}</span>
          <h2
            className="font-black uppercase leading-[0.85] tracking-tighter mt-2 mb-3"
            style={{ fontSize: "clamp(2.5rem, 8vw, 7rem)" }}
          >
            {t.contact.title}
          </h2>
          <a href="mailto:hi@kama.uz"
            className="inline-block text-base font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-14 underline underline-offset-4">
            hi@kama.uz
          </a>

          <div className="grid md:grid-cols-2 gap-16">
            <ContactForm />
            <div className="flex flex-col justify-between gap-8">
              <p className="text-sm text-[var(--muted)] leading-relaxed">{t.contact.sub}</p>
              <div className="space-y-4 border-t border-[var(--card-border)] pt-8">
                {[
                  { href: "https://github.com/kbatirov", icon: Github, label: "github.com/kbatirov" },
                  { href: "https://linkedin.com/in/kbatirov", icon: Linkedin, label: "linkedin.com/in/kbatirov" },
                  { href: "mailto:hi@kama.uz", icon: Mail, label: "hi@kama.uz" },
                ].map(({ href, icon: Icon, label }) => (
                  <a key={href} href={href} target={href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors font-medium group">
                    <Icon size={14} className="shrink-0" />
                    <span className="group-hover:underline underline-offset-4">{label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────── */}
      <footer className="border-t border-[var(--card-border)] py-5 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--muted)]">{t.footer}</span>
          <a href="/miniapp"
            className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            Dashboard →
          </a>
        </div>
      </footer>
    </div>
  );
}
