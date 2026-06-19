"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, CalendarDays, ListChecks, Sprout, Activity, Wallet, Notebook, type LucideIcon } from "lucide-react";
import { useLang } from "@/components/providers";
import { TodayTab } from "./_components/today-tab";
import { TasksTab } from "./_components/tasks-tab";
import { ServerTab } from "./_components/server-tab";
import { BudgetTab } from "./_components/budget-tab";
import { JournalTab } from "./_components/journal-tab";
import { LearnTab } from "./_components/learn";
import { SettingsModal } from "./_components/settings-modal";
import { IconButton } from "./_components/dashboard-ui";

type TabId = "today" | "tasks" | "learn" | "server" | "budget" | "journal";
const TABS: { id: TabId; icon: LucideIcon; key: keyof typeof import("@/lib/i18n").translations.en.dash.tabs }[] = [
  { id: "today",   icon: CalendarDays, key: "today" },
  { id: "tasks",   icon: ListChecks,   key: "tasks" },
  { id: "learn",   icon: Sprout,       key: "learn" },
  { id: "server",  icon: Activity,     key: "server" },
  { id: "budget",  icon: Wallet,       key: "budget" },
  { id: "journal", icon: Notebook,     key: "journal" },
];

const VALID_TABS: ReadonlySet<TabId> = new Set(TABS.map(t => t.id));

function readTabFromHash(): TabId {
  if (typeof window === "undefined") return "today";
  // Hash is `#<tab>` or `#<tab>/<sub>` — the main tab is the first segment.
  const h = window.location.hash.replace(/^#/, "").split("/")[0];
  return VALID_TABS.has(h as TabId) ? (h as TabId) : "today";
}

// Tames the on-screen keyboard lag:
//  • mirrors the *visual* viewport height into `--app-h`, so the shell shrinks
//    with the keyboard and the focused field is revealed by the inner scroll
//    (fast) instead of iOS's slow whole-page scroll;
//  • reports `kbOpen` from focus events (instant — fires the moment you tap an
//    input, well before the keyboard finishes animating) so the bottom nav can
//    get out of the way without the resize-driven delay.
function useKeyboard(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const syncHeight = () => {
      if (vv) root.style.setProperty("--app-h", `${Math.round(vv.height)}px`);
    };
    const editable = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      if (!n || !n.tagName) return false;
      return n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.isContentEditable;
    };
    // Only treat focus as "keyboard opening" on touch devices — on desktop
    // focusing an input shouldn't hide the nav (there's no keyboard).
    const coarse = () => window.matchMedia("(pointer: coarse)").matches;
    const onFocusIn = (e: FocusEvent) => { if (editable(e.target) && coarse()) setOpen(true); };
    const onFocusOut = () => {
      // Focus may hop straight to another field — re-check on the next tick.
      setTimeout(() => { if (!editable(document.activeElement)) setOpen(false); }, 0);
    };

    syncHeight();
    vv?.addEventListener("resize", syncHeight);
    vv?.addEventListener("scroll", syncHeight);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      vv?.removeEventListener("resize", syncHeight);
      vv?.removeEventListener("scroll", syncHeight);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--app-h");
    };
  }, []);
  return open;
}

export default function DashboardPage() {
  const { t } = useLang();
  const d = t.dash;
  const router = useRouter();
  const [tab, setTab]           = useState<TabId>("today");
  const [settings, setSettings] = useState(false);
  const kbOpen = useKeyboard();
  const [authed, setAuthed]     = useState(false);
  const [checking, setChecking] = useState(true);
  const [inboxNew, setInboxNew] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => { if (data.ok) setAuthed(true); else router.replace("/miniapp/login"); })
      .catch(() => router.replace("/miniapp/login"))
      .finally(() => setChecking(false));
  }, [router]);

  // Instant revocation via server push (SSE): if this session is revoked from
  // another device or via Telegram, the server pushes a `revoked` event and we
  // drop to login sub-second — no reload.
  useEffect(() => {
    if (!authed) return;
    let closed = false;
    const es = new EventSource("/api/auth/sessions/stream");
    es.addEventListener("revoked", () => { if (!closed) router.replace("/miniapp/login"); });
    return () => { closed = true; es.close(); };
  }, [authed, router]);

  // Fallback heartbeat: covers the case where SSE silently dies (proxy drop,
  // legacy cookie with no session id). Checks immediately on tab focus, plus a
  // slow interval while visible. Only an explicit 401 logs out — blips don't.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (!cancelled && r.status === 401) router.replace("/miniapp/login");
      } catch { /* transient network error — ignore */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const id = setInterval(() => { if (document.visibilityState === "visible") check(); }, 30000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [authed, router]);

  // Unread inbox badge on the Server nav button — cheap count, polled.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    const tick = () =>
      fetch("/api/dashboard/inbox/count")
        .then(r => r.json())
        .then(d => { if (!cancelled) setInboxNew(Number(d?.new ?? 0)); })
        .catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [authed]);

  // Restore active tab from URL hash on mount, and react to back/forward.
  useEffect(() => {
    setTab(readTabFromHash());
    const onHashChange = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const switchTab = (id: TabId) => {
    setTab(id);
    if (typeof window !== "undefined" && window.location.hash !== `#${id}`) {
      history.replaceState(null, "", `#${id}`);
    }
  };

  if (checking) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-xs text-[var(--muted)] animate-pulse">{d.loading}</div>
    </div>
  );
  if (!authed) return null;

  const tabTitle = d.tabs[tab];

  return (
    <div
      className="bg-[var(--background)] text-[var(--foreground)] flex flex-col overflow-hidden"
      style={{ height: "var(--app-h, 100dvh)" }}
    >

      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] font-medium">
            {d.title}
          </div>
          <h1 className="text-xl font-bold tracking-tight capitalize mt-0.5">
            {tabTitle}
          </h1>
        </div>
        <IconButton size="md" variant="outline" onClick={() => setSettings(true)} aria-label="settings">
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
      </header>

      {/* Content */}
      <main
        className="flex-1 overflow-auto px-5"
        style={{
          paddingBottom: kbOpen
            ? "16px"
            : "calc(96px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        {tab === "today"   && <TodayTab />}
        {tab === "tasks"   && <TasksTab />}
        {tab === "learn"   && <LearnTab />}
        {tab === "server"  && <ServerTab />}
        {tab === "budget"  && <BudgetTab />}
        {tab === "journal" && <JournalTab />}
      </main>

      {/* Floating bottom nav — slides out of the way while the keyboard is open */}
      <nav
        className={[
          "fixed bottom-0 left-0 right-0 px-4 pb-3 z-30 transition-[transform,opacity] duration-200 ease-out",
          kbOpen ? "translate-y-full opacity-0 pointer-events-none" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={kbOpen}
        style={{ paddingBottom: "calc(12px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))" }}
      >
        <div className="pointer-events-auto mx-auto max-w-md grid grid-cols-6 rounded-2xl border border-[var(--card-border)] bg-[var(--background)]/85 backdrop-blur-xl shadow-pop overflow-hidden">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => switchTab(tb.id)}
              aria-label={d.tabs[tb.key]}
              aria-current={tab === tb.id}
              className={[
                "relative flex flex-col items-center gap-0.5 py-2 transition-all cursor-pointer",
                tab === tb.id
                  ? "bg-[var(--surface-2)]"
                  : "opacity-50 hover:opacity-100",
              ].join(" ")}
            >
              {tb.id === "server" && inboxNew > 0 && (
                <span className="absolute top-1 right-1/2 translate-x-[14px] min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--accent)] text-[var(--background)] text-[9px] font-bold leading-[15px] tabular-nums text-center pointer-events-none">
                  {inboxNew > 99 ? "99+" : inboxNew}
                </span>
              )}
              <tb.icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              <span className={[
                "text-[8px] uppercase tracking-[0.12em] font-semibold",
                tab === tb.id ? "text-[var(--foreground)]" : "text-[var(--muted)]",
              ].join(" ")}>
                {d.tabs[tb.key]}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
