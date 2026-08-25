"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Users, X, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { SectionHeader, IconButton } from "./dashboard-ui";

interface Member {
  id: string;
  telegram_id: string | null;
  role: "owner" | "guest";
  display_name: string;
  revoked_at: string | null;
}

/**
 * Owner-only: who can see the shared tracker.
 *
 * Inviting mints a single-use link and asks the bot to deliver it. If the guest
 * has never started a chat with the bot, Telegram refuses to message them —
 * that is expected, so the link is shown here for the owner to pass along.
 */
export function MembersSection({ open }: { open: boolean }) {
  const { t } = useLang();
  const m = t.dash.members;
  const [rows, setRows] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [tgId, setTgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; delivered: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/members").then(x => x.json()).catch(() => null);
    if (Array.isArray(r)) setRows(r);
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const invite = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr(null); setLink(null);
    const r = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), telegram_id: tgId.trim() }),
    }).then(x => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(r?.error ?? m.inviteFailed); return; }
    setLink({ url: r.url, delivered: r.delivered });
    setName(""); setTgId("");
    await load();
  };

  const revoke = async (row: Member) => {
    if (!confirm(m.revokeConfirm.replace("{name}", row.display_name))) return;
    await fetch("/api/admin/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    await load();
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <section>
      <SectionHeader eyebrow={m.title} trailing={<Users className="h-4 w-4 text-[var(--muted)]" />} />
      <Card className="p-2">
        <div className="flex flex-col">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={["flex items-center gap-2 px-2 py-2.5", i > 0 ? "border-t border-[var(--card-border)]" : ""].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">
                  {row.display_name}
                  {row.role === "owner" && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">{m.you}</span>
                  )}
                </div>
                <div className="text-[10px] text-[var(--muted)] tabular-nums">
                  {row.revoked_at ? m.revoked : row.telegram_id || m.noTelegram}
                </div>
              </div>
              {row.role !== "owner" && !row.revoked_at && (
                <IconButton
                  size="sm" variant="ghost" onClick={() => void revoke(row)}
                  className="hover:text-red-500" aria-label={m.revoke} title={m.revoke}
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--card-border)] mt-1 pt-3 px-2 pb-1 flex flex-col gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={m.namePh} className="h-9 text-sm" />
          <Input value={tgId} onChange={e => setTgId(e.target.value)} placeholder={m.tgPh} className="h-9 text-sm tabular-nums" />
          <button
            onClick={() => void invite()}
            disabled={busy || !name.trim()}
            className="h-9 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" /> {m.invite}
          </button>
          {err && <div className="text-[11px] text-red-500">{err}</div>}
          {link && (
            <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
              <div className="text-[11px] text-[var(--muted)] mb-1.5">
                {link.delivered ? m.sent : m.notSent}
              </div>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 min-w-0 text-[10px] break-all">{link.url}</code>
                <IconButton size="sm" variant="outline" onClick={() => void copy()} aria-label={m.copy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </IconButton>
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
