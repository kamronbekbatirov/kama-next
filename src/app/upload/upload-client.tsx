"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  Check, File as FileIcon, Image as ImageIcon, Music, Play, Upload, Video, X,
} from "lucide-react";
import { useLang } from "@/components/providers";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";

/** Must stay at or under MAX_CHUNK_BYTES on the server (8 MB). */
const CHUNK_BYTES = 4 * 1024 * 1024;

type Phase = "idle" | "uploading" | "done" | "error";
type FileState = "queued" | "uploading" | "sent" | "rejected";

interface Picked {
  key: string;
  file: File;
  sent: number;
  state: FileState;
  reason?: string;
  /** Object URL for a local thumbnail; revoked when the file is dropped. */
  preview?: string;
}

interface Rejection {
  filename: string;
  reason: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

const isImage = (f: File) => f.type.startsWith("image/");
const isVideo = (f: File) => f.type.startsWith("video/");

function iconFor(file: File, size = 15) {
  if (isImage(file)) return <ImageIcon size={size} />;
  if (isVideo(file)) return <Video size={size} />;
  if (file.type.startsWith("audio/")) return <Music size={size} />;
  return <FileIcon size={size} />;
}

/** Local thumbnail, or a type icon when the browser can't render one. */
function Thumb({ item, className = "" }: { item: Picked; className?: string }) {
  if (item.preview && isImage(item.file)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.preview} alt="" className={`object-cover ${className}`} />;
  }
  if (item.preview && isVideo(item.file)) {
    return (
      <span className={`relative block ${className}`}>
        <video src={item.preview} preload="metadata" muted playsInline className="w-full h-full object-cover bg-black" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <Play size={16} className="text-white" fill="currentColor" />
        </span>
      </span>
    );
  }
  return (
    <span className={`flex items-center justify-center bg-[var(--card-border)]/25 text-[var(--muted)] ${className}`}>
      {iconFor(item.file, 18)}
    </span>
  );
}

/**
 * Public drop-box.
 *
 * Files are sliced client-side and streamed to /api/upload/chunk a few MB at a
 * time, so a phone video uploads with a real progress bar and the server never
 * holds a whole file in memory. The server independently re-validates
 * everything — nothing here is a security control, it's just UX.
 */
export function UploadClient() {
  const { t } = useLang();
  const tu = t.upload;

  const [picked, setPicked] = useState<Picked[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Release every object URL still held when the page goes away.
  const liveUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = liveUrls.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const add = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setPicked((prev) => [
      ...prev,
      ...Array.from(files).map((file) => {
        let preview: string | undefined;
        if (isImage(file) || isVideo(file)) {
          preview = URL.createObjectURL(file);
          liveUrls.current.add(preview);
        }
        return {
          key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
          file,
          sent: 0,
          state: "queued" as FileState,
          preview,
        };
      }),
    ]);
    setPhase("idle");
    setError(null);
  }, []);

  const drop = useCallback((item: Picked) => {
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
      liveUrls.current.delete(item.preview);
    }
    setPicked((prev) => prev.filter((x) => x.key !== item.key));
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  };

  const reasonLabel = (reason: string) =>
    ({
      type: tu.errType,
      size: tu.errSize,
      empty: tu.errEmpty,
      content: tu.errContent,
      name: tu.errName,
    })[reason] ?? reason;

  const errorLabel = (code: string) =>
    ({
      rate_limited: tu.rateLimited,
      quota_bytes: tu.quota,
      quota_files: tu.quota,
      store_full: tu.storeFull,
      too_many_files: tu.tooMany.replace("{n}", "15"),
      submission_too_large: tu.tooLarge,
    })[code] ?? tu.failed;

  /** Mark the files the server named as rejected, with the reason it gave. */
  const applyRejections = (list: Rejection[]) =>
    setPicked((prev) =>
      prev.map((p) => {
        const hit = list.find((r) => r.filename === p.file.name && p.state !== "sent");
        return hit ? { ...p, state: "rejected" as FileState, reason: hit.reason } : p;
      }),
    );

  const total = picked.reduce((n, p) => n + p.file.size, 0);
  const sentBytes = picked.reduce((n, p) => n + p.sent, 0);
  const pct = total > 0 ? Math.round((sentBytes / total) * 100) : 0;
  const delivered = picked.filter((p) => p.state === "sent");
  const deliveredBytes = delivered.reduce((n, p) => n + p.file.size, 0);
  const refused = picked.filter((p) => p.state === "rejected");

  async function submit() {
    if (!picked.length || phase === "uploading") return;
    setPhase("uploading");
    setError(null);
    setPicked((prev) => prev.map((p) => ({ ...p, sent: 0, state: "queued", reason: undefined })));

    try {
      // 1. Declare the batch. The server vets names/sizes before any bytes move.
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: honeypot.current?.value ?? "",
          files: picked.map((p) => ({ name: p.file.name, size: p.file.size })),
        }),
      });
      const init = await initRes.json();

      if (!initRes.ok) {
        if (init.error === "all_rejected") {
          // Nothing got through; the type check is what almost always did it.
          setPicked((prev) => prev.map((p) => ({ ...p, state: "rejected", reason: "type" })));
        }
        setError(errorLabel(init.error));
        setPhase("error");
        return;
      }
      if (Array.isArray(init.rejected) && init.rejected.length) applyRejections(init.rejected);

      // The server echoes each accepted file's position in the list we sent, so
      // duplicate names can't be mixed up.
      const accepted: { id: string; index: number }[] = init.files;

      // 2. Stream each file in slices.
      for (const { id: fileId, index } of accepted) {
        const item = picked[index];
        if (!item) continue;
        setPicked((prev) =>
          prev.map((p) => (p.key === item.key ? { ...p, state: "uploading" } : p)),
        );

        for (let offset = 0; offset < item.file.size; offset += CHUNK_BYTES) {
          const end = Math.min(offset + CHUNK_BYTES, item.file.size);
          const res = await fetch("/api/upload/chunk", {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-session-id": init.sessionId,
              "x-upload-token": init.token,
              "x-file-id": fileId,
            },
            body: item.file.slice(offset, end),
          });
          if (!res.ok) throw new Error("chunk");
          setPicked((prev) => prev.map((p) => (p.key === item.key ? { ...p, sent: end } : p)));
        }
      }

      // 3. Commit — the server re-checks each file's magic bytes here.
      const commitRes = await fetch("/api/upload/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: init.sessionId, token: init.token, name, contact, note }),
      });
      const commit = await commitRes.json();
      if (!commitRes.ok) {
        setError(errorLabel(commit.error));
        setPhase("error");
        return;
      }

      const stored: string[] = (commit.stored ?? []).map((s: { filename: string }) => s.filename);
      setPicked((prev) =>
        prev.map((p) =>
          p.state === "rejected" || !stored.includes(p.file.name)
            ? p
            : { ...p, state: "sent" as FileState, sent: p.file.size },
        ),
      );
      if (Array.isArray(commit.rejected) && commit.rejected.length) applyRejections(commit.rejected);
      setPhase("done");
    } catch {
      setError(tu.failed);
      setPhase("error");
    }
  }

  function reset() {
    picked.forEach((p) => {
      if (p.preview) {
        URL.revokeObjectURL(p.preview);
        liveUrls.current.delete(p.preview);
      }
    });
    setPicked([]);
    setNote("");
    setPhase("idle");
    setError(null);
  }

  const inputCls =
    "w-full h-11 px-4 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--muted)]/55";
  const labelCls =
    "block text-[10px] font-bold mb-2 uppercase tracking-[0.15em] text-[var(--muted)]";
  const btnCls =
    "h-11 px-8 bg-[var(--foreground)] text-[var(--background)] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-75 transition-opacity disabled:opacity-30";

  return (
    <main className="min-h-screen px-5 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between mb-12">
          <a href="/" className="text-sm font-bold tracking-tight hover:opacity-70 transition-opacity">
            kama.uz
          </a>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{tu.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{tu.sub}</p>

        {/* ── Delivered ─────────────────────────────────────────────── */}
        {phase === "done" ? (
          <div className="mt-10">
            <div className="flex items-center gap-2.5 border border-[var(--foreground)] px-4 py-3">
              <Check size={16} className="shrink-0" />
              <p className="text-sm font-medium">{tu.success}</p>
            </div>

            {delivered.length > 0 && (
              <>
                <p className={`${labelCls} mt-8`}>
                  {tu.uploadedLabel} · {delivered.length} · {fmtBytes(deliveredBytes)}
                </p>
                <ul className="grid grid-cols-3 gap-2">
                  {delivered.map((p) => (
                    <li key={p.key} className="group">
                      <div className="relative aspect-square border border-[var(--card-border)] overflow-hidden">
                        <Thumb item={p} className="w-full h-full" />
                        <span className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-[var(--foreground)] text-[var(--background)]">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] truncate" title={p.file.name}>{p.file.name}</p>
                      <p className="text-[10px] text-[var(--muted)] tabular-nums">{fmtBytes(p.file.size)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {refused.length > 0 && (
              <RejectedList items={refused} label={tu.partial} reasonLabel={reasonLabel} />
            )}

            <button onClick={reset} className={`${btnCls} mt-8 w-full`}>{tu.sendMore}</button>
          </div>
        ) : (
          <>
            {/* ── Drop zone ───────────────────────────────────────────── */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              className={`mt-10 border border-dashed py-12 text-center cursor-pointer transition-colors ${
                dragging
                  ? "border-[var(--foreground)] bg-[var(--foreground)]/[0.04]"
                  : "border-[var(--card-border)] hover:border-[var(--foreground)]/40"
              }`}
            >
              <Upload size={22} className="mx-auto text-[var(--muted)]" />
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em]">{tu.drop}</p>
              <p className="mt-1.5 text-xs text-[var(--muted)]">{tu.browse}</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { add(e.target.files); e.target.value = ""; }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">
              {tu.accepted.replace("{max}", "250 MB")}
            </p>

            {/* ── Picked files ────────────────────────────────────────── */}
            {picked.length > 0 && (
              <>
                <div className="flex items-baseline justify-between mt-8 mb-2">
                  <p className={`${labelCls} mb-0`}>
                    {tu.selected} · {picked.length}
                  </p>
                  <p className="text-[10px] text-[var(--muted)] tabular-nums">{fmtBytes(total)}</p>
                </div>
                <ul className="divide-y divide-[var(--card-border)] border-y border-[var(--card-border)]">
                  {picked.map((p) => {
                    const filePct = p.file.size ? Math.round((p.sent / p.file.size) * 100) : 0;
                    return (
                      <li key={p.key} className="flex items-center gap-3 py-2.5">
                        <div className="shrink-0 w-11 h-11 border border-[var(--card-border)] overflow-hidden">
                          <Thumb item={p} className="w-full h-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm" title={p.file.name}>{p.file.name}</p>
                          <p className="text-[11px] text-[var(--muted)] tabular-nums">
                            {p.state === "rejected" ? (
                              <span className="text-red-500">{reasonLabel(p.reason ?? "type")}</span>
                            ) : p.state === "sent" ? (
                              <span className="inline-flex items-center gap-1">
                                <Check size={11} /> {fmtBytes(p.file.size)}
                              </span>
                            ) : p.state === "uploading" ? (
                              `${filePct}% · ${fmtBytes(p.file.size)}`
                            ) : (
                              fmtBytes(p.file.size)
                            )}
                          </p>
                          {p.state === "uploading" && (
                            <div className="mt-1.5 h-px bg-[var(--card-border)]">
                              <div
                                className="h-full bg-[var(--foreground)] transition-all duration-200"
                                style={{ width: `${filePct}%` }}
                              />
                            </div>
                          )}
                        </div>
                        {phase !== "uploading" && (
                          <button
                            onClick={() => drop(p)}
                            aria-label={`${tu.remove} ${p.file.name}`}
                            className="shrink-0 w-8 h-8 inline-flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* ── Sender details ──────────────────────────────────────── */}
            <div className="mt-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="up-name">{tu.nameLabel}</label>
                  <input
                    id="up-name" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder={tu.namePlaceholder} className={inputCls} autoComplete="name"
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="up-contact">{tu.contactLabel}</label>
                  <input
                    id="up-contact" type="email" value={contact} onChange={(e) => setContact(e.target.value)}
                    placeholder={tu.contactPlaceholder} className={inputCls} autoComplete="email"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="up-note">{tu.noteLabel}</label>
                <textarea
                  id="up-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder={tu.notePlaceholder}
                  className="w-full px-4 py-3 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--muted)]/55 resize-none"
                />
              </div>

              {/* Honeypot — hidden from people, irresistible to bots. */}
              <input
                ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off"
                aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0"
              />
            </div>

            {error && <p className="mt-5 text-sm text-red-500">{error}</p>}

            <button
              onClick={submit}
              disabled={!picked.length || phase === "uploading"}
              className={`${btnCls} mt-6 w-full`}
            >
              {phase === "uploading"
                ? `${tu.sending} ${pct}%`
                : picked.length === 1
                  ? tu.sendOne
                  : tu.send.replace("{n}", String(picked.length))}
            </button>

            {phase === "uploading" && (
              <div className="mt-3 h-px bg-[var(--card-border)]">
                <div
                  className="h-full bg-[var(--foreground)] transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function RejectedList({
  items, label, reasonLabel,
}: {
  items: Picked[];
  label: string;
  reasonLabel: (r: string) => string;
}) {
  return (
    <div className="mt-6 border border-red-500/30 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-500">{label}</p>
      <ul className="mt-2 space-y-1">
        {items.map((p) => (
          <li key={p.key} className="text-[11px] text-[var(--muted)] break-all">
            {p.file.name} — {reasonLabel(p.reason ?? "type")}
          </li>
        ))}
      </ul>
    </div>
  );
}
