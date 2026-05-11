"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useLang } from "@/components/providers";
import { TodayTab } from "./_components/today-tab";
import { TasksTab } from "./_components/tasks-tab";
import { JobsTab } from "./_components/jobs-tab";
import { BudgetTab } from "./_components/budget-tab";
import { JournalTab } from "./_components/journal-tab";
import { LearnTab } from "./_components/learn";
import { SettingsModal } from "./_components/settings-modal";
import { IconButton } from "./_components/dashboard-ui";

type TabId = "today" | "tasks" | "learn" | "jobs" | "budget" | "journal";
const TABS: { id: TabId; icon: string; key: keyof typeof import("@/lib/i18n").translations.en.dash.tabs }[] = [
  { id: "today",   icon: "📅", key: "today" },
  { id: "tasks",   icon: "✅", key: "tasks" },
  { id: "learn",   icon: "🌳", key: "learn" },
  { id: "jobs",    icon: "💼", key: "jobs" },
  { id: "budget",  icon: "💰", key: "budget" },
  { id: "journal", icon: "📓", key: "journal" },
];

export default function DashboardPage() {
  const { t } = useLang();
  const d = t.dash;
  const router = useRouter();
  const [tab, setTab]           = useState<TabId>("today");
  const [settings, setSettings] = useState(false);
  const [authed, setAuthed]     = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => { if (data.ok) setAuthed(true); else router.replace("/miniapp/login"); })
      .catch(() => router.replace("/miniapp/login"))
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-xs text-[var(--muted)] animate-pulse">{d.loading}</div>
    </div>
  );
  if (!authed) return null;

  const tabTitle = d.tabs[tab];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">

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
        style={{ paddingBottom: "calc(96px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))" }}
      >
        {tab === "today"   && <TodayTab />}
        {tab === "tasks"   && <TasksTab />}
        {tab === "learn"   && <LearnTab />}
        {tab === "jobs"    && <JobsTab />}
        {tab === "budget"  && <BudgetTab />}
        {tab === "journal" && <JournalTab />}
      </main>

      {/* Floating bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 px-4 pb-3 pointer-events-none z-30"
        style={{ paddingBottom: "calc(12px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))" }}
      >
        <div className="pointer-events-auto mx-auto max-w-md grid grid-cols-6 rounded-2xl border border-[var(--card-border)] bg-[var(--background)]/85 backdrop-blur-xl shadow-pop overflow-hidden">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              aria-label={d.tabs[tb.key]}
              aria-current={tab === tb.id}
              className={[
                "flex flex-col items-center gap-0.5 py-2 transition-all cursor-pointer",
                tab === tb.id
                  ? "bg-[var(--surface-2)]"
                  : "opacity-50 hover:opacity-100",
              ].join(" ")}
            >
              <span className="text-lg leading-none">{tb.icon}</span>
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
