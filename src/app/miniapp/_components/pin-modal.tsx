"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLang } from "@/components/providers";

type PinResult = { ok: boolean; error?: string };
type Step = "current" | "enter" | "confirm";

// 4-digit PIN entry.
//   mode "enter"  → verify once (unlock / remove).
//   mode "set"    → new PIN twice (enter + confirm).
//   mode "change" → verify current PIN, then new PIN twice.
// onSubmit gets the new/entered pin (and the verified current pin for "change").
export function PinModal({
  mode,
  onClose,
  onSubmit,
  onVerify,
}: {
  mode: "set" | "enter" | "change";
  onClose: () => void;
  onSubmit: (pin: string, currentPin?: string) => Promise<PinResult>;
  onVerify?: (pin: string) => Promise<PinResult>;
}) {
  const { t } = useLang();
  const d = t.dash.notes;
  const [step, setStep] = useState<Step>(mode === "change" ? "current" : "enter");
  const [first, setFirst] = useState("");
  const [current, setCurrent] = useState("");
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [step]);

  const fail = (msg: string) => {
    setErr(msg);
    setVal("");
    setShake(true);
    setTimeout(() => setShake(false), 420);
  };

  const errMsg = (e?: string) => (e === "rate_limited" ? d.pinRateLimited : d.pinWrong);

  const verifyCurrent = async (pin: string) => {
    if (!onVerify) return;
    setBusy(true);
    try {
      const r = await onVerify(pin);
      if (r.ok) { setCurrent(pin); setStep("enter"); setVal(""); }
      else fail(errMsg(r.error));
    } catch {
      fail(d.pinWrong);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (pin: string) => {
    setBusy(true);
    try {
      const r = await onSubmit(pin, current || undefined);
      if (r.ok) { onClose(); return; }
      fail(errMsg(r.error));
    } catch {
      fail(d.pinWrong);
    } finally {
      setBusy(false);
    }
  };

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setErr("");
    setVal(digits);
    if (digits.length < 4) return;

    if (mode === "enter") { void submit(digits); return; }
    if (mode === "change" && step === "current") { void verifyCurrent(digits); return; }

    // set / change → collect new PIN then confirm it
    if (step === "enter") {
      setFirst(digits);
      setStep("confirm");
      setVal("");
    } else if (digits === first) {
      void submit(digits);
    } else {
      setStep("enter");
      setFirst("");
      fail(d.pinMismatch);
    }
  };

  let heading: string, hint: string;
  if (mode === "enter") {
    heading = d.enterPinTitle; hint = d.enterPinHint;
  } else if (mode === "change" && step === "current") {
    heading = d.currentPinTitle; hint = d.currentPinHint;
  } else if (step === "confirm") {
    heading = d.confirmPinTitle; hint = d.confirmPinHint;
  } else {
    heading = mode === "change" ? d.newPinTitle : d.setPinTitle;
    hint = mode === "change" ? d.newPinHint : d.setPinHint;
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-xs">
        <div className="flex flex-col items-center text-center gap-4 py-3">
          <div className="h-12 w-12 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">{heading}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{hint}</div>
          </div>

          <div
            className={["relative cursor-text", shake ? "animate-shake" : ""].join(" ")}
            onClick={() => inputRef.current?.focus()}
          >
            <div className="flex gap-3 justify-center">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={[
                    "w-12 h-14 rounded-2xl border-2 flex items-center justify-center transition-all",
                    err
                      ? "border-red-500"
                      : i === val.length
                        ? "border-[var(--foreground)]"
                        : "border-[var(--card-border)]",
                    val[i] ? "bg-[var(--surface-2)]" : "",
                  ].join(" ")}
                >
                  {val[i] && <span className="h-2.5 w-2.5 rounded-full bg-[var(--foreground)] inline-block" />}
                </div>
              ))}
            </div>
            <input
              ref={inputRef}
              value={val}
              onChange={e => handle(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              disabled={busy}
              autoFocus
              className="absolute inset-0 w-full opacity-0"
              aria-label={heading}
            />
          </div>

          <div className="h-4 text-xs font-medium text-red-500">{err}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
