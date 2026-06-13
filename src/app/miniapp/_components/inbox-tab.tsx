"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive, ArchiveRestore, Inbox as InboxIcon, Mail, Reply, Trash2,
} from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/providers";
import { api, jPatch, jDel } from "./_shared";
import { SoftCard, SectionHeader, Pill, Chip, EmptyState, IconButton } from "./dashboard-ui";

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

interface InboxResponse {
  messages: Msg[];
  counts: { new: number; read: number; archived: number };
}

type Filter = "inbox" | "new" | "archived";

function timeAgo(iso: string, t: typeof translations.en): string {
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

function MessageCard({
  m, t, onChange,
}: {
  m: Msg;
  t: typeof translations.en;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = m.status === "new";

  const expand = () => {
    setOpen((v) => !v);
    if (unread) jPatch("/api/dashboard/inbox", { id: m.id, action: "read" }).then(onChange);
  };

  const act = (action: string) =>
    jPatch("/api/dashboard/inbox", { id: m.id, action }).then(onChange);
  const remove = () => {
    if (confirm(t.dash.inbox.confirmDelete)) jDel("/api/dashboard/inbox", { id: m.id }).then(onChange);
  };

  const replyHref = m.email
    ? `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject ?? t.dash.inbox.title}`)}`
    : null;

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
          <span className="shrink-0 text-[10px] text-[var(--muted)] tabular-nums">
            {timeAgo(m.created_at, t)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <Chip tone="muted">{m.source}</Chip>
          <Chip tone={m.kind === "feedback" ? "info" : m.kind === "email" ? "success" : "neutral"}>
            {m.kind === "feedback" ? t.dash.inbox.feedback : m.kind === "email" ? t.dash.inbox.email : t.dash.inbox.contact}
            {m.category ? ` · ${m.category}` : ""}
          </Chip>
        </div>
        <p
          className={`mt-2 text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words ${
            open ? "" : "line-clamp-2"
          }`}
        >
          {m.message}
        </p>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--card-border)] flex items-center gap-2">
          {replyHref && (
            <a
              href={replyHref}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 transition"
            >
              <Reply size={13} /> {t.dash.inbox.reply}
            </a>
          )}
          {m.email && (
            <span className="text-[11px] text-[var(--muted)] truncate">{m.email}</span>
          )}
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
    </SoftCard>
  );
}

export function InboxTab() {
  const { lang } = useLang();
  const t = translations[lang as Lang] ?? translations.en;
  const [filter, setFilter] = useState<Filter>("inbox");
  const [data, setData] = useState<InboxResponse | null>(null);

  const load = useCallback(() => {
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
      <div className="flex gap-1.5 flex-wrap">
        <Pill size="sm" active={filter === "inbox"} onClick={() => setFilter("inbox")}>
          {t.dash.inbox.all}
          {counts.new > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-[var(--accent)] text-[var(--background)] text-[10px] font-bold tabular-nums">
              {counts.new}
            </span>
          )}
        </Pill>
        <Pill size="sm" active={filter === "new"} onClick={() => setFilter("new")}>
          {t.dash.inbox.new}
        </Pill>
        <Pill size="sm" active={filter === "archived"} onClick={() => setFilter("archived")}>
          {t.dash.inbox.archived}
        </Pill>
      </div>

      {data == null ? (
        <div className="text-center text-[var(--muted)] py-10 text-sm">{t.dash.loading}</div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<InboxIcon size={28} />}
          title={t.dash.inbox.empty}
          hint={t.dash.inbox.emptyHint}
        />
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <MessageCard key={m.id} m={m} t={t} onChange={load} />
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
