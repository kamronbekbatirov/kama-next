"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive, ArchiveRestore, CornerUpLeft, Inbox as InboxIcon, Mail,
  PenSquare, Reply, Send, Trash2, X,
} from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/providers";
import { api, jPost, jPatch, jDel } from "./_shared";
import { SoftCard, Pill, Chip, EmptyState, IconButton } from "./dashboard-ui";

type T = typeof translations.en;

interface Msg {
  id: number;
  source: string;
  kind: "contact" | "feedback" | "email";
  category: string | null;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  meta: Record<string, unknown>;
  status: "new" | "read" | "archived";
  created_at: string;
}

interface Sent {
  id: number;
  in_reply_to: number | null;
  from_addr: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

interface InboxResponse {
  messages: Msg[];
  counts: { new: number; read: number; archived: number };
}

type Filter = "inbox" | "new" | "sent" | "archived";

const inputCls =
  "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--foreground)]/40";

function timeAgo(iso: string, t: T): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t.dash.inbox.justNow;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

// ─── Composer (reply or new) ─────────────────────────────────────────────────

function Composer({
  t, senders, initial, inReplyTo, onSent, onCancel,
}: {
  t: T;
  senders: string[];
  initial: { to: string; toName: string | null; subject: string; body: string };
  inReplyTo: number | null;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState(senders[0] ?? "hi@kama.uz");
  const [to, setTo] = useState(initial.to);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    const r = await jPost("/api/dashboard/inbox/reply", {
      from, to, toName: initial.toName, subject, body, in_reply_to: inReplyTo,
    });
    setSending(false);
    if (r?.ok) onSent();
    else setError(r?.error || "Send failed");
  };

  return (
    <div className="space-y-2 rounded-xl border border-[var(--card-border)] bg-[var(--surface-2)]/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--muted)] w-12 shrink-0">{t.dash.inbox.from}</span>
        {senders.length > 1 ? (
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>
            {senders.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className="text-xs text-[var(--muted)]">{from}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--muted)] w-12 shrink-0">{t.dash.inbox.to}</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className={inputCls} />
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.dash.inbox.subjectLabel} className={inputCls} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder={t.dash.inbox.bodyPlaceholder}
        className={`${inputCls} resize-y leading-relaxed`}
        autoFocus
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Pill size="sm" onClick={onCancel}>{t.dash.inbox.cancel}</Pill>
        <button
          onClick={send}
          disabled={sending || !to || !body.trim()}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 disabled:opacity-40 transition"
        >
          <Send size={13} /> {sending ? t.dash.inbox.sending : t.dash.inbox.send}
        </button>
      </div>
    </div>
  );
}

// ─── A received message ──────────────────────────────────────────────────────

function MessageCard({
  m, t, senders, onChange,
}: {
  m: Msg;
  t: T;
  senders: string[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [thread, setThread] = useState<Sent[]>([]);
  const unread = m.status === "new";

  const loadThread = useCallback(() => {
    api(`/api/dashboard/inbox/sent?in_reply_to=${m.id}`).then((r) => {
      if (r && Array.isArray(r.messages)) setThread(r.messages as Sent[]);
    });
  }, [m.id]);

  const expand = () => {
    const next = !open;
    setOpen(next);
    if (next) loadThread();
    if (next && unread) jPatch("/api/dashboard/inbox", { id: m.id, action: "read" }).then(onChange);
  };

  const act = (action: string) => jPatch("/api/dashboard/inbox", { id: m.id, action }).then(onChange);
  const remove = () => {
    if (confirm(t.dash.inbox.confirmDelete)) jDel("/api/dashboard/inbox", { id: m.id }).then(onChange);
  };

  return (
    <SoftCard className={`px-4 py-3 ${unread ? "border-[var(--accent)]/40" : ""}`}>
      <button onClick={expand} className="w-full text-left cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            {unread && <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--accent)]" />}
            <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>
              {m.name || m.email || t.dash.inbox.anonymous}
            </span>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {thread.length > 0 && (
              <CornerUpLeft size={11} className="text-[var(--muted)]" aria-label={t.dash.inbox.repliedLabel} />
            )}
            <span className="text-[10px] text-[var(--muted)] tabular-nums">{timeAgo(m.created_at, t)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <Chip tone="muted">{m.source}</Chip>
          <Chip tone={m.kind === "feedback" ? "info" : m.kind === "email" ? "success" : "neutral"}>
            {m.kind === "feedback" ? t.dash.inbox.feedback : m.kind === "email" ? t.dash.inbox.email : t.dash.inbox.contact}
            {m.category ? ` · ${m.category}` : ""}
          </Chip>
          {m.subject && <span className="text-[11px] text-[var(--muted)] truncate">{m.subject}</span>}
        </div>
        <p className={`mt-2 text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words ${open ? "" : "line-clamp-2"}`}>
          {m.message}
        </p>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-3">
          {/* Prior replies */}
          {thread.map((s) => (
            <div key={s.id} className="rounded-lg bg-[var(--surface-2)]/50 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2 text-[var(--muted)]">
                <span className="truncate">↩ {s.from_addr} → {s.to_email}</span>
                <span className="shrink-0 flex items-center gap-1.5">
                  {s.status === "failed" && <Chip tone="danger">{t.dash.inbox.failed}</Chip>}
                  <span className="tabular-nums">{timeAgo(s.created_at, t)}</span>
                </span>
              </div>
              <p className="mt-1 text-[var(--foreground)]/80 whitespace-pre-wrap break-words">{s.body}</p>
            </div>
          ))}

          {replying ? (
            <Composer
              t={t}
              senders={senders}
              inReplyTo={m.id}
              initial={{
                to: m.email ?? "",
                toName: m.name,
                subject: `Re: ${m.subject ?? t.dash.inbox.title}`,
                body: "",
              }}
              onSent={() => { setReplying(false); loadThread(); onChange(); }}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <div className="flex items-center gap-2">
              {m.email && (
                <button
                  onClick={() => setReplying(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 transition"
                >
                  <Reply size={13} /> {t.dash.inbox.reply}
                </button>
              )}
              {m.email && <span className="text-[11px] text-[var(--muted)] truncate">{m.email}</span>}
              <div className="ml-auto flex items-center gap-1">
                {m.status === "archived" ? (
                  <IconButton size="sm" variant="ghost" onClick={() => act("unarchive")} aria-label={t.dash.inbox.unarchive}>
                    <ArchiveRestore size={15} />
                  </IconButton>
                ) : (
                  <IconButton size="sm" variant="ghost" onClick={() => act("archive")} aria-label={t.dash.inbox.archive}>
                    <Archive size={15} />
                  </IconButton>
                )}
                <IconButton size="sm" variant="ghost" onClick={remove} aria-label={t.dash.inbox.delete}>
                  <Trash2 size={15} className="text-red-500" />
                </IconButton>
              </div>
            </div>
          )}
        </div>
      )}
    </SoftCard>
  );
}

// ─── A sent message (Sent view) ──────────────────────────────────────────────

function SentCard({ s, t }: { s: Sent; t: T }) {
  const [open, setOpen] = useState(false);
  return (
    <SoftCard className="px-4 py-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <span className="truncate text-sm font-medium">→ {s.to_name || s.to_email}</span>
          <div className="shrink-0 flex items-center gap-1.5">
            {s.status === "failed" && <Chip tone="danger">{t.dash.inbox.failed}</Chip>}
            <span className="text-[10px] text-[var(--muted)] tabular-nums">{timeAgo(s.created_at, t)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <Chip tone="muted">{s.from_addr}</Chip>
          {s.subject && <span className="text-[11px] text-[var(--muted)] truncate">{s.subject}</span>}
        </div>
        <p className={`mt-2 text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words ${open ? "" : "line-clamp-2"}`}>
          {s.body}
        </p>
      </button>
      {open && s.error && <p className="mt-2 text-xs text-red-500">{s.error}</p>}
    </SoftCard>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function InboxTab() {
  const { lang } = useLang();
  const t = translations[lang as Lang] ?? translations.en;
  const [filter, setFilter] = useState<Filter>("inbox");
  const [data, setData] = useState<InboxResponse | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [senders, setSenders] = useState<string[]>(["hi@kama.uz"]);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    api("/api/dashboard/inbox/reply").then((r) => {
      if (r && Array.isArray(r.senders) && r.senders.length) setSenders(r.senders);
    });
  }, []);

  const load = useCallback(() => {
    if (filter === "sent") {
      api("/api/dashboard/inbox/sent").then((r) => {
        if (r && Array.isArray(r.messages)) setSent(r.messages as Sent[]);
      });
      return;
    }
    const q = filter === "inbox" ? "" : `?status=${filter}`;
    api(`/api/dashboard/inbox${q}`).then((r) => {
      if (r && Array.isArray(r.messages)) setData(r as InboxResponse);
    });
  }, [filter]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const counts = data?.counts ?? { new: 0, read: 0, archived: 0 };
  const messages = data?.messages ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill size="sm" active={filter === "inbox"} onClick={() => setFilter("inbox")}>
          {t.dash.inbox.all}
          {counts.new > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-[var(--accent)] text-[var(--background)] text-[10px] font-bold tabular-nums">
              {counts.new}
            </span>
          )}
        </Pill>
        <Pill size="sm" active={filter === "new"} onClick={() => setFilter("new")}>{t.dash.inbox.new}</Pill>
        <Pill size="sm" active={filter === "sent"} onClick={() => setFilter("sent")}>{t.dash.inbox.sent}</Pill>
        <Pill size="sm" active={filter === "archived"} onClick={() => setFilter("archived")}>{t.dash.inbox.archived}</Pill>
        <button
          onClick={() => setComposing((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 transition"
        >
          {composing ? <X size={13} /> : <PenSquare size={13} />} {t.dash.inbox.compose}
        </button>
      </div>

      {composing && (
        <Composer
          t={t}
          senders={senders}
          inReplyTo={null}
          initial={{ to: "", toName: null, subject: "", body: "" }}
          onSent={() => { setComposing(false); if (filter === "sent") load(); }}
          onCancel={() => setComposing(false)}
        />
      )}

      {/* Sent view */}
      {filter === "sent" ? (
        sent == null ? (
          <div className="text-center text-[var(--muted)] py-10 text-sm">{t.dash.loading}</div>
        ) : sent.length === 0 ? (
          <EmptyState icon={<Send size={26} />} title={t.dash.inbox.emptySent} />
        ) : (
          <div className="space-y-2">{sent.map((s) => <SentCard key={s.id} s={s} t={t} />)}</div>
        )
      ) : data == null ? (
        <div className="text-center text-[var(--muted)] py-10 text-sm">{t.dash.loading}</div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<InboxIcon size={28} />} title={t.dash.inbox.empty} hint={t.dash.inbox.emptyHint} />
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <MessageCard key={m.id} m={m} t={t} senders={senders} onChange={load} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[var(--muted)] pt-1">
        <Mail size={11} />
        {t.dash.inbox.footnote}
      </div>
    </div>
  );
}
