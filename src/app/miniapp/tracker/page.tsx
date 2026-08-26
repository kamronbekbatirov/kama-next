"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useLang } from "@/components/providers";
import { TrackerTab } from "../_components/tracker";
import { SettingsModal } from "../_components/settings-modal";
import { IconButton } from "../_components/dashboard-ui";
import { TimezoneProvider } from "../_components/timezone";

/**
 * The guest's whole app.
 *
 * A separate page rather than the owner's shell with tabs filtered out. The
 * owner's nav is declared in three independent places and its hash router runs
 * before a role is known, so a filtered version would render an owner tab for a
 * frame on a deep link. Here the guest simply has no route to anything else.
 */
export default function TrackerPage() {
  const { t } = useLang();
  const x = t.dash.tracker;
  const router = useRouter();
  const [me, setMe] = useState<{ role: string; name: string; memberId: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { if (d.ok) setMe(d); else router.replace("/miniapp/login"); })
      .catch(() => router.replace("/miniapp/login"))
      .finally(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    const es = new EventSource("/api/auth/sessions/stream");
    es.addEventListener("revoked", () => router.replace("/miniapp/login"));
    return () => es.close();
  }, [me, router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-xs text-[var(--muted)] animate-pulse">{t.dash.loading}</div>
      </div>
    );
  }
  if (!me) return null;

  return (
    <TimezoneProvider>
      <div
        className="bg-[var(--background)] text-[var(--foreground)] flex flex-col overflow-hidden"
        style={{ height: "var(--app-h, 100dvh)" }}
      >
        <header className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] font-medium">
              {x.title}
            </div>
            <h1 className="text-xl font-bold tracking-tight truncate mt-0.5">{me.name}</h1>
          </div>
          <IconButton size="md" variant="outline" onClick={() => setSettings(true)} aria-label="settings">
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-8">
          <TrackerTab meId={me.memberId} />
        </main>

        <SettingsModal open={settings} onClose={() => setSettings(false)} />
      </div>
    </TimezoneProvider>
  );
}
