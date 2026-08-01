"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, File as FileIcon, Image as ImageIcon, Music, Play, Plus, Upload,
  Video, X,
} from "lucide-react";
import { useLang } from "@/components/providers";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";

/** Must stay at or under MAX_CHUNK_BYTES on the server (8 MB). */
const CHUNK_BYTES = 4 * 1024 * 1024;

/** Shown as chips so the accepted set reads at a glance. */
const FORMAT_CHIPS = ["JPG", "PNG", "HEIC", "MP4", "MOV", "MP3", "PDF", "DOCX"];

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
          <Play size={14} className="text-white" fill="currentColor" />
        </span>
      </span>
    );
  }
  return (
    <span className={`flex items-center justify-center bg-[var(--surface-2)] text-[var(--muted)] ${className}`}>
      {iconFor(item.file, 17)}
    </span>
  );
}

/** The little fan of cards in the middle of the drop zone. */
function DropArt() {
  const card =
    "absolute h-14 w-11 rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] " +
    "flex items-center justify-center text-[var(--muted)] shadow-[var(--shadow-soft)] " +
    "transition-transform duration-300 ease-out";
  return (
    <span className="relative mx-auto mb-6 flex h-16 w-28 items-center justify-center" aria-hidden="true">
      <span className={`${card} -translate-x-7 -rotate-[14deg] group-hover:-translate-x-10 group-hover:-rotate-[22deg]`}>
        <Video size={15} />
      </span>
      <span className={`${card} translate-x-7 rotate-[14deg] group-hover:translate-x-10 group-hover:rotate-[22deg]`}>
        <FileIcon size={15} />
      </span>
      <span className={`${card} group-hover:-translate-y-1.5`}>
        <ImageIcon size={16} />
      </span>
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
  const [details, setDetails] = useState(false);
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

  // Drop anywhere on the page, not just on the box. dragenter/dragleave fire
  // for every child element, so nesting is counted rather than toggled.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes("Files");
    const onEnter = (e: DragEvent) => { if (hasFiles(e)) { depth += 1; setDragging(true); } };
    const onLeave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false); };
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      add(e.dataTransfer!.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [add]);

  // Paste a screenshot straight in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length) { e.preventDefault(); add(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const drop = useCallback((item: Picked) => {
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
      liveUrls.current.delete(item.preview);
    }
    setPicked((prev) => prev.filter((x) => x.key !== item.key));
  }, []);

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
        setPicked((prev) => prev.map((p) => (p.key === item.key ? { ...p, state: "uploading" } : p)));

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
    setDetails(false);
    setPhase("idle");
    setError(null);
  }

  const field =
    "w-full h-12 px-4 rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--background)] text-sm " +
    "outline-none transition-colors focus:border-[var(--foreground)] placeholder:text-[var(--muted)]/60";
  const label = "block text-xs font-medium mb-1.5 text-[var(--muted)]";
  const primary =
    "w-full h-12 rounded-full bg-[var(--foreground)] text-[var(--background)] text-sm font-semibold " +
    "transition-all hover:opacity-85 active:scale-[.99] disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100";

  return (
    <main className="min-h-screen px-5 py-8 sm:py-14">
      {/* Drop-anywhere affordance */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm pointer-events-none animate-fade-in">
          <div className="rounded-[var(--radius-2xl)] border-2 border-dashed border-[var(--foreground)] px-12 py-10 text-center">
            <Upload size={26} className="mx-auto" />
            <p className="mt-3 text-sm font-semibold">{tu.dropNow}</p>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between mb-10">
          <a href="/" className="text-sm font-bold tracking-tight hover:opacity-70 transition-opacity">
            kama.uz
          </a>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>

        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight leading-tight">{tu.title}</h1>
        <p className="mt-2.5 text-sm text-[var(--muted)] leading-relaxed">{tu.sub}</p>

        {/* ── Delivered ─────────────────────────────────────────────── */}
        {phase === "done" ? (
          <div className="mt-8 animate-fade-in">
            <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--foreground)] text-[var(--background)] px-4 py-3.5">
              <Check size={17} className="shrink-0" strokeWidth={2.5} />
              <p className="text-sm font-medium">{tu.success}</p>
            </div>

            {delivered.length > 0 && (
              <>
                <p className="mt-7 mb-2.5 text-xs font-medium text-[var(--muted)]">
                  {tu.uploadedLabel} · {delivered.length} · {fmtBytes(deliveredBytes)}
                </p>
                <ul className="grid grid-cols-3 gap-2.5">
                  {delivered.map((p) => (
                    <li key={p.key}>
                      <div className="relative aspect-square rounded-[var(--radius-md)] overflow-hidden border border-[var(--card-border)]">
                        <Thumb item={p} className="w-full h-full" />
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center">
                          <Check size={11} strokeWidth={3} />
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

            <button onClick={reset} className={`${primary} mt-7`}>{tu.sendMore}</button>
          </div>
        ) : (
          <>
            {/* The hero zone owns the empty state; once files are chosen the
                list matters more, so it shrinks to a single "add more" row. */}
            {picked.length === 0 ? (
              <>
              {/* ── Drop zone ───────────────────────────────────────────── */}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`group relative mt-8 w-full overflow-hidden rounded-[var(--radius-2xl)] border px-6 py-12 text-center transition-all duration-200 ${
                  dragging
                    ? "border-[var(--foreground)] bg-[var(--surface-2)]"
                    : "border-[var(--card-border)] bg-[var(--surface)] hover:border-[var(--foreground)]/25 hover:shadow-[var(--shadow-soft)]"
                }`}
              >
                {/* dot grid */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, var(--card-border) 1px, transparent 0)",
                    backgroundSize: "22px 22px",
                  }}
                />
                {/* corner brackets */}
                {[
                  "left-3 top-3 border-l-2 border-t-2 rounded-tl-lg",
                  "right-3 top-3 border-r-2 border-t-2 rounded-tr-lg",
                  "left-3 bottom-3 border-l-2 border-b-2 rounded-bl-lg",
                  "right-3 bottom-3 border-r-2 border-b-2 rounded-br-lg",
                ].map((pos) => (
                  <span
                    key={pos}
                    aria-hidden="true"
                    className={`pointer-events-none absolute h-5 w-5 border-[var(--foreground)]/15 transition-all duration-300 group-hover:h-7 group-hover:w-7 group-hover:border-[var(--foreground)]/35 ${pos}`}
                  />
                ))}

                <span className="relative block">
                  <DropArt />
                  <span className="inline-flex h-11 items-center rounded-full bg-[var(--foreground)] px-6 text-sm font-semibold text-[var(--background)] transition-transform duration-200 group-hover:scale-[1.03]">
                    {tu.chooseFiles}
                  </span>
                  <span className="mt-3.5 block text-xs text-[var(--muted)]">{tu.orDrop}</span>
                  <span className="mt-1 hidden text-[11px] text-[var(--muted)]/70 sm:block">{tu.pasteHint}</span>
                </span>

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { add(e.target.files); e.target.value = ""; }}
                />
              </button>

              {/* Accepted formats */}
              <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                {FORMAT_CHIPS.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-[var(--card-border)] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--muted)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[var(--muted)]">{tu.maxSize}</p>
              </>
            ) : null}
            {/* ── Picked files ────────────────────────────────────────── */}
            {picked.length > 0 && (
              <ul className="mt-6 space-y-2">
                {picked.map((p) => {
                  const filePct = p.file.size ? Math.round((p.sent / p.file.size) * 100) : 0;
                  return (
                    <li
                      key={p.key}
                      className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-2.5 py-2.5 transition-colors ${
                        p.state === "rejected"
                          ? "border-[var(--destructive)]/35 bg-[var(--destructive)]/[0.04]"
                          : "border-[var(--card-border)] bg-[var(--surface)]"
                      }`}
                    >
                      <div className="shrink-0 w-11 h-11 rounded-[10px] overflow-hidden border border-[var(--card-border)]">
                        <Thumb item={p} className="w-full h-full" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm leading-tight" title={p.file.name}>{p.file.name}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)] tabular-nums">
                          {p.state === "rejected" ? (
                            <span className="text-[var(--destructive)]">{reasonLabel(p.reason ?? "type")}</span>
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
                          <div className="mt-1.5 h-1 rounded-full bg-[var(--card-border)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--foreground)] transition-all duration-200"
                              style={{ width: `${filePct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {phase !== "uploading" && (
                        <button
                          onClick={() => drop(p)}
                          aria-label={`${tu.remove} ${p.file.name}`}
                          className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Compact stand-in for the hero once the list has taken over */}
            {picked.length > 0 && phase !== "uploading" && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-dashed text-xs font-medium transition-colors ${
                  dragging
                    ? "border-[var(--foreground)] text-[var(--foreground)]"
                    : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--foreground)]/35 hover:text-[var(--foreground)]"
                }`}
              >
                <Plus size={14} /> {tu.addMore}
              </button>
            )}

            {/* ── Optional details, folded away by default ──────────────
                Only offered once there's something to attach them to, so the
                empty state stays a single action. */}
            <div className={picked.length > 0 ? "mt-5" : "hidden"}>
              <button
                type="button"
                onClick={() => setDetails((v) => !v)}
                aria-expanded={details}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                {details ? <ChevronDown size={14} /> : <Plus size={14} />}
                {details ? tu.hideDetails : tu.addDetails}
                {!details && (
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                    {tu.optional}
                  </span>
                )}
              </button>

              {details && (
                <div className="mt-4 space-y-3.5 animate-fade-in">
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={label} htmlFor="up-name">{tu.nameLabel}</label>
                      <input
                        id="up-name" value={name} onChange={(e) => setName(e.target.value)}
                        placeholder={tu.namePlaceholder} className={field} autoComplete="name"
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="up-contact">{tu.contactLabel}</label>
                      <input
                        id="up-contact" type="email" value={contact} onChange={(e) => setContact(e.target.value)}
                        placeholder={tu.contactPlaceholder} className={field} autoComplete="email"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={label} htmlFor="up-note">{tu.noteLabel}</label>
                    <textarea
                      id="up-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                      placeholder={tu.notePlaceholder}
                      className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--input-border)] bg-[var(--background)] text-sm outline-none transition-colors focus:border-[var(--foreground)] placeholder:text-[var(--muted)]/60 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Honeypot — hidden from people, irresistible to bots. */}
              <input
                ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off"
                aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0"
              />
            </div>

            {error && <p className="mt-4 text-sm text-[var(--destructive)]">{error}</p>}

            {/* No files, no call to action — a greyed-out button is just noise */}
            {picked.length > 0 && (
              <button onClick={submit} disabled={phase === "uploading"} className={`${primary} mt-6`}>
                {phase === "uploading"
                  ? `${tu.sending} ${pct}%`
                  : picked.length === 1
                    ? tu.sendOne
                    : `${tu.send.replace("{n}", String(picked.length))} · ${fmtBytes(total)}`}
              </button>
            )}

            {phase === "uploading" && (
              <div className="mt-3 h-1 rounded-full bg-[var(--card-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--foreground)] transition-all duration-200"
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
    <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--destructive)]/30 bg-[var(--destructive)]/[0.04] px-4 py-3">
      <p className="text-xs font-semibold text-[var(--destructive)]">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((p) => (
          <li key={p.key} className="text-[11px] text-[var(--muted)] break-all">
            {p.file.name} — {reasonLabel(p.reason ?? "type")}
          </li>
        ))}
      </ul>
    </div>
  );
}
