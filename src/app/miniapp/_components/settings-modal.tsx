"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, Palette, Languages, User, Monitor, Smartphone, X, ShieldCheck, Lock, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { SectionHeader } from "./dashboard-ui";
import { PinModal } from "./pin-modal";

interface SessionInfo {
  id: string;
  kind: string;
  method: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

function deviceLabel(s: SessionInfo): string {
  if (s.kind === "telegram") return "Telegram";
  const ua = s.user_agent ?? "";
  const browser = /Edg/.test(ua) ? "Edge"
    : /OPR|Opera/.test(ua) ? "Opera"
    : /Chrome|CriOS/.test(ua) ? "Chrome"
    : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /Safari/.test(ua) ? "Safari"
    : "Browser";
  const os = /iPhone|iPad|iPod|iOS/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

function isMobile(s: SessionInfo): boolean {
  return s.kind === "telegram" || /iPhone|iPad|iPod|Android|Mobile/.test(s.user_agent ?? "");
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

function SessionsSection({ open }: { open: boolean }) {
  const { t } = useLang();
  const d = t.dash.settingsModal;
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      if (res.ok) setSessions(await res.json());
      else setSessions([]);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const act = async (body: object) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.loggedOut) { router.replace("/miniapp/login"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const others = (sessions ?? []).filter(s => !s.current).length;

  return (
    <section>
      <SectionHeader
        eyebrow={d.sessions}
        trailing={<ShieldCheck className="h-3.5 w-3.5 text-[var(--muted)]" />}
      />
      <Card className="p-2">
        {sessions === null ? (
          <div className="py-4 text-center text-xs text-[var(--muted)] animate-pulse">…</div>
        ) : sessions.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--muted)]">{d.noSessions}</div>
        ) : (
          <div className="flex flex-col">
            {sessions.map((s, i) => {
              const Icon = isMobile(s) ? Smartphone : Monitor;
              return (
                <div
                  key={s.id}
                  className={[
                    "flex items-center gap-3 py-2.5 px-2",
                    i > 0 ? "border-t border-[var(--card-border)]" : "",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 text-[var(--muted)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <span className="truncate">{deviceLabel(s)}</span>
                      {s.current && (
                        <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-emerald-500 shrink-0">
                          {d.current}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] truncate">
                      {[s.ip || null, relTime(s.last_seen_at)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {!s.current && (
                    <button
                      onClick={() => act({ id: s.id })}
                      disabled={busy}
                      aria-label={d.revoke}
                      title={d.revoke}
                      className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-red-500 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {others > 0 && (
        <button
          onClick={() => act({ scope: "others" })}
          disabled={busy}
          className="mt-2 w-full h-10 rounded-2xl border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/40 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          {d.endOthers}
        </button>
      )}
    </section>
  );
}

type PinResult = { ok: boolean; error?: string };
type PinJob = {
  mode: "set" | "change" | "enter";
  submit: (pin: string, currentPin?: string) => Promise<PinResult>;
  onVerify?: (pin: string) => Promise<PinResult>;
};

function NoteLockSection({ open }: { open: boolean }) {
  const { t } = useLang();
  const d = t.dash.settingsModal;
  const [status, setStatus] = useState<{ pinSet: boolean; unlocked: boolean } | null>(null);
  const [job, setJob] = useState<PinJob | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/notes/lock");
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const post = (body: object): Promise<PinResult> =>
    fetch("/api/dashboard/notes/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({ ok: false }));

  const setPinJob = () =>
    setJob({ mode: "set", submit: async (pin) => { const r = await post({ action: "set", pin }); if (r.ok) load(); return r; } });

  const changePinJob = () =>
    setJob({
      mode: "change",
      onVerify: (pin) => post({ action: "unlock", pin }),
      submit: async (pin, currentPin) => { const r = await post({ action: "set", pin, oldPin: currentPin }); if (r.ok) load(); return r; },
    });

  const removePinJob = () =>
    setJob({ mode: "enter", submit: async (pin) => { const r = await post({ action: "disable", pin }); if (r.ok) load(); return r; } });

  const lockNow = async () => {
    setBusy(true);
    await post({ action: "lock" });
    await load();
    setBusy(false);
  };

  const rowCls = (danger?: boolean) =>
    [
      "w-full flex items-center gap-2.5 py-2.5 px-3 text-sm font-medium transition-colors cursor-pointer disabled:opacity-40",
      danger ? "text-red-500 hover:bg-red-500/10" : "hover:bg-[var(--surface-2)]",
    ].join(" ");

  return (
    <section>
      <SectionHeader eyebrow={d.noteLock} trailing={<Lock className="h-3.5 w-3.5 text-[var(--muted)]" />} />
      <Card className="p-2">
        <div className="flex items-center justify-between gap-3 py-2 px-3">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 text-[var(--muted)]" />
            <span className="text-sm font-medium">PIN</span>
          </div>
          <span className={status?.pinSet ? "text-[11px] font-semibold text-emerald-500" : "text-[11px] font-semibold text-[var(--muted)]"}>
            {status?.pinSet ? d.pinOn : d.pinOff}
          </span>
        </div>

        {status && (
          <>
            <div className="border-t border-[var(--card-border)] my-1" />
            {!status.pinSet ? (
              <button onClick={setPinJob} disabled={busy} className={rowCls()}>
                <KeyRound className="h-4 w-4 text-[var(--muted)]" />
                {d.setPin}
              </button>
            ) : (
              <>
                <button onClick={changePinJob} disabled={busy} className={rowCls()}>
                  <KeyRound className="h-4 w-4 text-[var(--muted)]" />
                  {d.changePin}
                </button>
                {status.unlocked && (
                  <button onClick={() => void lockNow()} disabled={busy} className={rowCls()}>
                    <Lock className="h-4 w-4 text-[var(--muted)]" />
                    {d.lockNow}
                  </button>
                )}
                <button onClick={removePinJob} disabled={busy} className={rowCls(true)}>
                  <Trash2 className="h-4 w-4" />
                  {d.removePin}
                </button>
              </>
            )}
          </>
        )}
      </Card>

      {job && (
        <PinModal mode={job.mode} onClose={() => setJob(null)} onSubmit={job.submit} onVerify={job.onVerify} />
      )}
    </section>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const d = t.dash.settingsModal;
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} side="bottom">
      <SheetContent className="pb-8">
        <SheetHeader>
          <SheetTitle>{d.title}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5">
          <section>
            <SectionHeader
              eyebrow={d.appearance}
              trailing={<Palette className="h-3.5 w-3.5 text-[var(--muted)]" />}
            />
            <Card className="p-2">
              <div className="flex items-center justify-between gap-3 py-2 px-3">
                <div className="flex items-center gap-2.5">
                  <Palette className="h-4 w-4 text-[var(--muted)]" />
                  <span className="text-sm font-medium">{d.theme}</span>
                </div>
                <ThemeToggle />
              </div>
              <div className="border-t border-[var(--card-border)] my-1" />
              <div className="flex items-center justify-between gap-3 py-2 px-3">
                <div className="flex items-center gap-2.5">
                  <Languages className="h-4 w-4 text-[var(--muted)]" />
                  <span className="text-sm font-medium">{d.language}</span>
                </div>
                <LangToggle />
              </div>
            </Card>
          </section>

          <NoteLockSection open={open} />

          <SessionsSection open={open} />

          <section>
            <SectionHeader
              eyebrow={d.account}
              trailing={<User className="h-3.5 w-3.5 text-[var(--muted)]" />}
            />
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/miniapp/login");
              }}
              className="w-full h-11 rounded-2xl border border-red-500/40 text-red-500 text-sm font-semibold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              {d.signOut}
            </button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
