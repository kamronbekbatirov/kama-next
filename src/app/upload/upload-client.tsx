"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { File as FileIcon, Image as ImageIcon, Music, Upload, Video, X } from "lucide-react";
import { useLang } from "@/components/providers";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";

/** Must stay at or under MAX_CHUNK_BYTES on the server (8 MB). */
const CHUNK_BYTES = 4 * 1024 * 1024;

type Phase = "idle" | "uploading" | "done" | "error";

interface Picked {
  key: string;
  file: File;
  sent: number;
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

function iconFor(type: string) {
  if (type.startsWith("image/")) return <ImageIcon size={15} />;
  if (type.startsWith("video/")) return <Video size={15} />;
  if (type.startsWith("audio/")) return <Music size={15} />;
  return <FileIcon size={15} />;
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
  const [rejected, setRejected] = useState<Rejection[]>([]);
  const [dragging, setDragging] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setPicked((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({
        key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
        file,
        sent: 0,
      })),
    ]);
    setPhase("idle");
    setError(null);
    setRejected([]);
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

  const total = picked.reduce((n, p) => n + p.file.size, 0);
  const sent = picked.reduce((n, p) => n + p.sent, 0);
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

  async function submit() {
    if (!picked.length || phase === "uploading") return;
    setPhase("uploading");
    setError(null);
    setRejected([]);
    setPicked((prev) => prev.map((p) => ({ ...p, sent: 0 })));

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
        if (Array.isArray(init.rejected)) setRejected(init.rejected);
        // Everything bounced: show why, per file, using the local checks.
        if (init.error === "all_rejected") {
          setRejected(picked.map((p) => ({ filename: p.file.name, reason: "type" })));
        }
        setError(errorLabel(init.error));
        setPhase("error");
        return;
      }

      if (Array.isArray(init.rejected) && init.rejected.length) setRejected(init.rejected);

      // The server returns only the files it accepted, in order.
      const acceptedNames = new Set<string>(init.files.map((f: { name: string }) => f.name));
      const queue = picked.filter((p) => acceptedNames.has(p.file.name.split(/[/\\]/).pop() ?? p.file.name));
      const idFor = new Map<string, string>();
      init.files.forEach((f: { id: string; name: string }, i: number) => {
        if (queue[i]) idFor.set(queue[i].key, f.id);
      });

      // 2. Stream each file in slices.
      for (const item of queue) {
        const fileId = idFor.get(item.key);
        if (!fileId) continue;
        for (let offset = 0; offset < item.file.size; offset += CHUNK_BYTES) {
          const slice = item.file.slice(offset, Math.min(offset + CHUNK_BYTES, item.file.size));
          const res = await fetch("/api/upload/chunk", {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-session-id": init.sessionId,
              "x-upload-token": init.token,
              "x-file-id": fileId,
            },
            body: slice,
          });
          if (!res.ok) throw new Error("chunk");
          const done = offset + CHUNK_BYTES >= item.file.size;
          setPicked((prev) =>
            prev.map((p) =>
              p.key === item.key
                ? { ...p, sent: done ? item.file.size : offset + CHUNK_BYTES }
                : p,
            ),
          );
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
      if (Array.isArray(commit.rejected) && commit.rejected.length) {
        setRejected((prev) => [...prev, ...commit.rejected]);
      }
      setPhase("done");
    } catch {
      setError(tu.failed);
      setPhase("error");
    }
  }

  function reset() {
    setPicked([]);
    setNote("");
    setPhase("idle");
    setError(null);
    setRejected([]);
  }

  const inputCls =
    "w-full h-11 px-4 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--card-border)]";
  const labelCls =
    "block text-[10px] font-bold mb-2 uppercase tracking-[0.15em] text-[var(--muted)]";

  return (
    <main className="min-h-screen px-5 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between mb-10">
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

        {phase === "done" ? (
          <div className="mt-8 border border-[var(--card-border)] p-6 text-center">
            <p className="text-sm font-medium">{tu.success}</p>
            {rejected.length > 0 && <RejectedList items={rejected} label={tu.partial} reasonLabel={reasonLabel} />}
            <button
              onClick={reset}
              className="mt-5 h-11 px-6 bg-[var(--foreground)] text-[var(--background)] text-sm font-medium hover:opacity-85 transition"
            >
              {tu.sendMore}
            </button>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              className={`mt-8 border border-dashed p-10 text-center cursor-pointer transition-colors ${
                dragging
                  ? "border-[var(--foreground)] bg-[var(--foreground)]/5"
                  : "border-[var(--card-border)] hover:border-[var(--foreground)]/40"
              }`}
            >
              <Upload size={24} className="mx-auto text-[var(--muted)]" />
              <p className="mt-3 text-sm font-medium">{tu.drop}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{tu.browse}</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { add(e.target.files); e.target.value = ""; }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              {tu.accepted.replace("{max}", "250 MB")}
            </p>

            {/* Picked files */}
            {picked.length > 0 && (
              <ul className="mt-5 space-y-2">
                {picked.map((p) => {
                  const filePct = p.file.size ? Math.round((p.sent / p.file.size) * 100) : 0;
                  return (
                    <li key={p.key} className="border border-[var(--card-border)] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="shrink-0 text-[var(--muted)]">{iconFor(p.file.type)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm" title={p.file.name}>
                          {p.file.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-[var(--muted)] tabular-nums">
                          {fmtBytes(p.file.size)}
                        </span>
                        {phase !== "uploading" && (
                          <button
                            onClick={() => setPicked((prev) => prev.filter((x) => x.key !== p.key))}
                            aria-label={`${tu.remove} ${p.file.name}`}
                            className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)] transition"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {phase === "uploading" && (
                        <div className="mt-2 h-0.5 bg-[var(--card-border)]">
                          <div
                            className="h-full bg-[var(--foreground)] transition-all duration-200"
                            style={{ width: `${filePct}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {rejected.length > 0 && <RejectedList items={rejected} label={tu.partial} reasonLabel={reasonLabel} />}

            {/* Sender details */}
            <div className="mt-6 space-y-4">
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
                  className="w-full px-4 py-3 border border-[var(--card-border)] bg-transparent text-sm outline-none focus:border-[var(--foreground)] transition-colors placeholder:text-[var(--card-border)] resize-none"
                />
              </div>

              {/* Honeypot — hidden from people, irresistible to bots. */}
              <input
                ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off"
                aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0"
              />
            </div>

            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

            <button
              onClick={submit}
              disabled={!picked.length || phase === "uploading"}
              className="mt-6 w-full h-12 bg-[var(--foreground)] text-[var(--background)] text-sm font-medium hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {phase === "uploading"
                ? `${tu.sending} ${pct}%`
                : tu.send.replace("{n}", String(picked.length))}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function RejectedList({
  items, label, reasonLabel,
}: {
  items: Rejection[];
  label: string;
  reasonLabel: (r: string) => string;
}) {
  return (
    <div className="mt-4 border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5 text-left">
      <p className="text-[11px] font-medium text-yellow-600 dark:text-yellow-500">{label}</p>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((r, i) => (
          <li key={`${r.filename}-${i}`} className="text-[11px] text-[var(--muted)] break-all">
            {r.filename} — {reasonLabel(r.reason)}
          </li>
        ))}
      </ul>
    </div>
  );
}
