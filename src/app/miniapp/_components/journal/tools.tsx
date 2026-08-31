"use client";

import { useRef, useState } from "react";
import { Download, FileAudio, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { SectionHeader } from "../dashboard-ui";
import { haptic } from "@/lib/telegram-webapp";

/**
 * Audio to text.
 *
 * The transcript comes back and stays here until it is downloaded or copied —
 * it is a tool, not a record, and what is worth keeping is not the tool's
 * decision. A BOM goes on the file because .md carries no encoding declaration
 * and phone viewers otherwise guess cp1251 at Cyrillic.
 */
export function JournalTools() {
  const { t } = useLang();
  const x = t.dash.tools;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ markdown: string; filename: string; lang: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (file: File) => {
    setErr(null); setResult(null); setName(file.name); setBusy(true);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const res = await fetch("/api/dashboard/tools/transcribe", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok || d?.error) {
        setErr(d?.error === "too_large" ? x.tooLarge : d?.error === "unsupported_type" ? x.badType : x.failed);
        return;
      }
      setResult(d);
      haptic.success();
    } catch {
      setErr(x.failed);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    // BOM first: .md declares no encoding, and without it Cyrillic opens as
    // mojibake in most phone viewers.
    const blob = new Blob(["﻿" + result.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = result.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <section>
        <SectionHeader eyebrow={x.transcribe} />
        <Card className="p-4">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.ogg,.mp3,.m4a,.wav,.flac,.aac,.opus"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void run(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full h-24 rounded-2xl border border-dashed border-[var(--card-border)] grid place-items-center text-[var(--muted)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)] transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="flex flex-col items-center gap-1.5">
              <FileAudio className="h-6 w-6" />
              <span className="text-xs font-semibold">{busy ? x.working : x.pick}</span>
              {name && <span className="text-[10px] text-[var(--muted)]">{name}</span>}
            </span>
          </button>
          <div className="text-[10px] text-[var(--muted)] mt-2 leading-snug">{x.hint}</div>
          {err && <div className="text-[11px] text-red-500 mt-2">{err}</div>}
        </Card>
      </section>

      {result && (
        <section>
          <SectionHeader
            eyebrow={x.result}
            trailing={result.lang ? <span className="text-[10px] text-[var(--muted)]">{result.lang}</span> : undefined}
          />
          <Card className="p-3">
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto font-sans">
              {result.markdown}
            </pre>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={download}
                className="h-9 px-4 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> {x.download}
              </button>
              <button
                onClick={() => void copy()}
                className="h-9 px-4 rounded-xl border border-[var(--card-border)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-[var(--muted-bg)] transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? x.copied : x.copy}
              </button>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
