"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive, ArchiveRestore, ChevronLeft, ChevronRight, CornerUpLeft, Download, FileText,
  Inbox as InboxIcon, Mail, Music, PenSquare, Play, Reply, RotateCw, Send, Trash2, Video, X,
} from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/providers";
import { api, jPost, jPatch, jDel } from "./_shared";
import { SoftCard, Pill, Chip, EmptyState, IconButton } from "./dashboard-ui";

type T = typeof translations.en;

interface Attachment {
  id: number;
  filename: string;
  mime: string;
  size_bytes: number;
  exp: number;
  sig: string;
}

interface Msg {
  id: number;
  source: string;
  kind: "contact" | "feedback" | "email" | "upload";
  category: string | null;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  html: string | null;
  meta: Record<string, unknown>;
  status: "new" | "read" | "archived";
  created_at: string;
  attachments?: Attachment[];
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

// ─── Email HTML body (rendered like a mail client) ───────────────────────────
// Sandboxed iframe: no scripts run (no allow-scripts), links open in a new tab,
// height auto-fits the content (capped). allow-same-origin only so we can read
// the rendered height back.
function EmailHtml({ html }: { html: string }) {
  const srcDoc =
    `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
    `<meta name="color-scheme" content="light"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>html{color-scheme:light}body{margin:0;padding:14px;background:#fff;color:#111;` +
    `font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;word-break:break-word}` +
    `img{max-width:100%!important;height:auto}a{color:#2563eb}table{max-width:100%!important}*{max-width:100%}</style>` +
    `</head><body>${html}</body></html>`;
  return (
    <iframe
      title="email"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      className="w-full rounded-lg border border-[var(--card-border)] bg-white"
      style={{ height: 220 }}
      onLoad={(e) => {
        try {
          const f = e.currentTarget;
          const h = f.contentWindow?.document?.body?.scrollHeight ?? 0;
          if (h) f.style.height = `${Math.min(Math.max(h + 16, 80), 760)}px`;
        } catch { /* cross-origin guard */ }
      }}
    />
  );
}

// ─── Uploaded files ──────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Minimal surface of the Telegram WebApp SDK that this tab uses. */
interface TGWebApp {
  isVersionAtLeast?: (v: string) => boolean;
  downloadFile?: (
    params: { url: string; file_name: string },
    callback?: (accepted: boolean) => void,
  ) => void;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
}

function telegram(): TGWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TGWebApp } }).Telegram?.WebApp;
}

/**
 * Attachment URLs carry a short-lived signature alongside the session cookie.
 * The cookie covers everything rendered inside the web view; the signature is
 * what makes the same URL work for Telegram's native downloader, which fetches
 * outside the web view.
 */
function fileUrl(a: Attachment, opts: { inline?: boolean } = {}): string {
  const q = new URLSearchParams({ exp: String(a.exp), sig: a.sig });
  if (opts.inline) q.set("inline", "1");
  return `/api/dashboard/inbox/attachment/${a.id}?${q}`;
}

function absolute(path: string): string {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).href;
}

/**
 * Save a file to the device. Inside Telegram (Bot API 8.0+) this opens the
 * native "download file?" prompt, which is the only way to get a real file into
 * the phone's storage from a Mini App. Outside it — desktop browser, or an
 * older client — fall back to a plain download link.
 */
function saveFile(a: Attachment) {
  const url = absolute(fileUrl(a));
  const tg = telegram();
  if (tg?.downloadFile && tg.isVersionAtLeast?.("8.0")) {
    tg.HapticFeedback?.impactOccurred?.("light");
    tg.downloadFile({ url, file_name: a.filename });
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = a.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const isImage = (a: Attachment) => a.mime.startsWith("image/");
const isVideo = (a: Attachment) => a.mime.startsWith("video/");
const isAudio = (a: Attachment) => a.mime.startsWith("audio/");
const isViewable = (a: Attachment) => isImage(a) || isVideo(a);

/** Full-screen viewer: tap a photo or video to open it properly, then save it. */
function Lightbox({
  files, index, t, onClose, onIndex,
}: {
  files: Attachment[];
  index: number;
  t: T;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const a = files[index];
  const many = files.length > 1;

  const go = useCallback(
    (delta: number) => onIndex((index + delta + files.length) % files.length),
    [index, files.length, onIndex],
  );

  // Esc closes, arrows page through. Also lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (many && e.key === "ArrowRight") go(1);
      if (many && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, go, many]);

  if (!a) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={a.filename}
    >
      {/* Top bar — sits below the Telegram header via the safe-area inset */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2.5 text-white/90"
        style={{ paddingTop: "max(0.625rem, var(--tg-content-safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={onClose}
          aria-label={t.dash.inbox.close}
          className="shrink-0 w-9 h-9 -ml-1 inline-flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition"
        >
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{a.filename}</div>
          <div className="text-[11px] text-white/50 tabular-nums">
            {fmtBytes(a.size_bytes)}
            {many ? ` · ${index + 1}/${files.length}` : ""}
          </div>
        </div>
        <button
          onClick={() => saveFile(a)}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-black text-xs font-semibold hover:opacity-90 active:scale-95 transition"
        >
          <Download size={14} /> {t.dash.inbox.save}
        </button>
      </div>

      {/* Media — tapping the backdrop closes, tapping the media itself doesn't */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center" onClick={onClose}>
        {isImage(a) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl(a, { inline: true })}
            alt={a.filename}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain select-none"
          />
        ) : (
          <video
            src={fileUrl(a, { inline: true })}
            controls
            autoPlay
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full"
          />
        )}

        {many && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label={t.dash.inbox.prev}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 transition"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label={t.dash.inbox.next}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 transition"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* Filmstrip */}
      {many && (
        <div
          className="shrink-0 flex gap-1.5 overflow-x-auto px-3 py-2.5"
          style={{ paddingBottom: "max(0.625rem, var(--tg-content-safe-area-inset-bottom, 0px))" }}
        >
          {files.map((f, i) => (
            <button
              key={f.id}
              onClick={() => onIndex(i)}
              aria-label={f.filename}
              className={`shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition ${
                i === index ? "border-white" : "border-transparent opacity-50"
              }`}
            >
              {isImage(f) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(f, { inline: true })} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-white/10 text-white/70">
                  <Video size={16} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Files dropped at /upload. Photos and video open full-screen on tap;
 * everything else is a row with a save button. Nothing is ever executed —
 * the bytes come back from the attachment route as inert, sandboxed content.
 */
function Attachments({ files, t }: { files: Attachment[]; t: T }) {
  const [open, setOpen] = useState<number | null>(null);
  const viewable = files.filter(isViewable);
  const rest = files.filter((f) => !isViewable(f));

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-[var(--muted)]">
        {t.dash.inbox.attachments} · {files.length}
      </div>

      {/* Photo / video grid */}
      {viewable.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {viewable.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setOpen(i)}
              aria-label={a.filename}
              className="relative aspect-square rounded-lg overflow-hidden bg-[var(--surface-2)] group"
            >
              {isImage(a) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(a, { inline: true })}
                  alt={a.filename}
                  loading="lazy"
                  className="w-full h-full object-cover transition group-active:scale-95"
                />
              ) : (
                <>
                  <video
                    src={fileUrl(a, { inline: true })}
                    preload="metadata"
                    muted
                    playsInline
                    className="w-full h-full object-cover bg-black"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <Play size={20} className="text-white drop-shadow" fill="currentColor" />
                  </span>
                </>
              )}
              <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/55 to-transparent" />
              <span className="absolute bottom-1 left-1.5 text-[9px] font-medium text-white/90 tabular-nums">
                {fmtBytes(a.size_bytes)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Documents, audio, everything else */}
      {rest.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2.5 rounded-lg border border-[var(--card-border)] px-2.5 py-2"
        >
          <span className="shrink-0 w-8 h-8 rounded-md bg-[var(--surface-2)] flex items-center justify-center text-[var(--muted)]">
            {isAudio(a) ? <Music size={15} /> : <FileText size={15} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium" title={a.filename}>
              {a.filename}
            </span>
            <span className="block text-[10px] text-[var(--muted)] tabular-nums">
              {fmtBytes(a.size_bytes)}
            </span>
            {isAudio(a) && (
              <audio src={fileUrl(a, { inline: true })} controls className="w-full h-7 mt-1.5" />
            )}
          </span>
          <button
            onClick={() => saveFile(a)}
            aria-label={`${t.dash.inbox.save} ${a.filename}`}
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition"
          >
            <Download size={15} />
          </button>
        </div>
      ))}

      {open !== null && (
        <Lightbox
          files={viewable}
          index={open}
          t={t}
          onClose={() => setOpen(null)}
          onIndex={setOpen}
        />
      )}
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
      {/* Header — click to expand/collapse (not selectable, so toggling is clean) */}
      <div onClick={expand} className="cursor-pointer select-none">
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
          <Chip
            tone={
              m.kind === "feedback" ? "info"
              : m.kind === "email" ? "success"
              : m.kind === "upload" ? "warning"
              : "neutral"
            }
          >
            {m.kind === "feedback" ? t.dash.inbox.feedback
              : m.kind === "email" ? t.dash.inbox.email
              : m.kind === "upload" ? t.dash.inbox.upload
              : t.dash.inbox.contact}
            {m.category ? ` · ${m.category}` : ""}
          </Chip>
          {m.attachments && m.attachments.length > 0 && (
            <Chip tone="muted">📎 {m.attachments.length}</Chip>
          )}
          {m.subject && <span className="text-[11px] text-[var(--muted)] truncate">{m.subject}</span>}
        </div>
        {!open && (
          <p className="mt-2 text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words line-clamp-2">
            {m.message}
          </p>
        )}
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-3">
          {/* Full body — selectable; HTML emails render like a mail client */}
          {m.kind === "email" && m.html ? (
            <EmailHtml html={m.html} />
          ) : (
            <div className="text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words select-text">
              {m.message}
            </div>
          )}

          {/* Files dropped at /upload */}
          {m.attachments && m.attachments.length > 0 && <Attachments files={m.attachments} t={t} />}

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

function SentCard({ s, t, onChange }: { s: Sent; t: T; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const remove = () => {
    if (confirm(t.dash.inbox.confirmDelete)) jDel("/api/dashboard/inbox/sent", { id: s.id }).then(onChange);
  };
  return (
    <SoftCard className="px-4 py-3">
      <div onClick={() => setOpen((v) => !v)} className="cursor-pointer select-none">
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
        {!open && (
          <p className="mt-2 text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words line-clamp-2">
            {s.body}
          </p>
        )}
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-2">
          <div className="text-sm text-[var(--foreground)]/90 whitespace-pre-wrap break-words select-text">
            {s.body}
          </div>
          <div className="flex items-center gap-2">
            {s.error && <p className="text-xs text-red-500 truncate">{s.error}</p>}
            <IconButton size="sm" variant="ghost" className="ml-auto" onClick={remove} aria-label={t.dash.inbox.delete}>
              <Trash2 size={15} className="text-red-500" />
            </IconButton>
          </div>
        </div>
      )}
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
  const [refreshing, setRefreshing] = useState(false);

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

  // Pull new received emails from Resend, then refresh the list.
  const syncAndLoad = useCallback(() => {
    fetch("/api/dashboard/inbox/sync", { method: "POST" })
      .catch(() => {})
      .finally(() => load());
  }, [load]);

  useEffect(() => {
    syncAndLoad();
    const id = setInterval(syncAndLoad, 20000);
    return () => clearInterval(id);
  }, [syncAndLoad]);

  // Manual refresh — pull new mail now, with a spinner.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetch("/api/dashboard/inbox/sync", { method: "POST" }); } catch {}
    load();
    setRefreshing(false);
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
          onClick={refresh}
          disabled={refreshing}
          aria-label={t.dash.inbox.refresh}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 disabled:opacity-50 transition"
        >
          <RotateCw size={13} className={refreshing ? "animate-spin" : ""} /> {t.dash.inbox.refresh}
        </button>
        <button
          onClick={() => setComposing((v) => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium bg-[var(--foreground)] text-[var(--background)] hover:opacity-85 transition"
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
          <div className="space-y-2">{sent.map((s) => <SentCard key={s.id} s={s} t={t} onChange={load} />)}</div>
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
