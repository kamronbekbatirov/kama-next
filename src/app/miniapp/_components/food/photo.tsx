"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { Pill } from "../dashboard-ui";
import { haptic, useTelegramBack } from "@/lib/telegram-webapp";
import { foodApi, fmtKcal } from "./api";
import type { Slot } from "./types";
import { SLOTS } from "./types";

interface Estimate { name: string; kcal: number; kcal_max: number; note: string }

/**
 * Photo → estimate → confirm.
 *
 * Nothing is written until the person presses the button: the estimate is
 * shown first, editable, with the model's stated assumption next to it. A photo
 * cannot show oil or portion weight, so the answer is a range — and the range
 * is preserved into the diary rather than being averaged into a single number
 * that would look like a measurement.
 */
export function PhotoEstimate({ day, onClose, onSaved }: {
  day: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const f = t.dash.food;
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [name, setName] = useState("");
  const [lo, setLo] = useState("");
  const [hi, setHi] = useState("");
  const [slot, setSlot] = useState<Slot>("snack");
  const [err, setErr] = useState<string | null>(null);

  useTelegramBack(true, onClose);

  const pick = async (file: File) => {
    setErr(null);
    setEst(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/dashboard/food/estimate", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok || d?.error) { setErr(String(d?.error ?? "error")); return; }
      setEst(d);
      setName(d.name);
      setLo(String(d.kcal));
      setHi(String(d.kcal_max));
      haptic.tap();
    } catch {
      setErr("error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const l = Math.round(Number(lo)), h = Math.round(Number(hi));
    if (!name.trim() || !Number.isFinite(l)) return;
    await foodApi.addEntry({
      day, name: name.trim(), slot,
      kcal: l, kcal_max: Number.isFinite(h) && h > l ? h : null,
      source: "photo", note: est?.note ?? null,
    });
    haptic.success();
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{f.photoTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) void pick(file); }}
          />

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={preview} alt="" className="w-full max-h-56 object-contain rounded-2xl bg-[var(--muted-bg)]" />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-2xl border border-dashed border-[var(--card-border)] grid place-items-center text-[var(--muted)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)] transition-all cursor-pointer"
            >
              <span className="flex flex-col items-center gap-1.5">
                <Camera className="h-6 w-6" />
                <span className="text-xs font-semibold">{f.photoPick}</span>
              </span>
            </button>
          )}

          {busy && <div className="text-xs text-[var(--muted)] text-center py-2">{f.photoAnalysing}</div>}
          {err && <div className="text-[11px] text-red-500">{err}</div>}

          {est && !busy && (
            <>
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-2)] p-3">
                <div className="text-lg font-bold tabular-nums">
                  {fmtKcal(Number(lo), Number(hi))} <span className="text-xs font-medium text-[var(--muted)]">{f.kcal}</span>
                </div>
                {est.note && (
                  <div className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">{est.note}</div>
                )}
              </div>

              <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" />
              <div className="flex items-center gap-2">
                <Input type="number" inputMode="numeric" value={lo} onChange={e => setLo(e.target.value)}
                       className="w-24 h-9 text-sm tabular-nums" />
                <span className="text-[var(--muted)]">–</span>
                <Input type="number" inputMode="numeric" value={hi} onChange={e => setHi(e.target.value)}
                       className="w-24 h-9 text-sm tabular-nums" />
                <span className="text-[11px] text-[var(--muted)]">{f.kcal}</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {SLOTS.map(s => (
                  <Pill key={s} size="sm" active={slot === s} onClick={() => setSlot(s)}>{f.slots[s]}</Pill>
                ))}
              </div>
              <div className="text-[10px] text-[var(--muted)] leading-snug">{f.photoHint}</div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{f.cancel}</Button>
          <Button onClick={() => void save()} disabled={!est || busy || !name.trim()}>
            {f.photoConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
