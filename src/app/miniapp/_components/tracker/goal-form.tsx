"use client";

import { useState } from "react";
import { useTelegramBack, useClosingConfirmation, haptic } from "@/lib/telegram-webapp";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useLang } from "@/components/providers";
import { todayIn } from "../_shared";
import { useTimezone } from "../timezone";
import { Pill } from "../dashboard-ui";
import { trackerApi } from "./api";

/**
 * Creating a goal is a short form with two non-negotiable halves: something
 * countable, and a plan for when it happens.
 *
 * Both are required here and in the database. A goal like "exercise more" has
 * nothing to check in against, and an intention with no "when" tends to stay an
 * intention — so the form does not let either be skipped.
 *
 * It is laid out as named sections rather than one stack of inputs, because the
 * two halves are the whole idea and a flat list hides that. Nothing is
 * invisible: the optional part stays folded to keep the form short, but its
 * heading names what is inside, so a guest can see it exists without opening it.
 */
export function GoalForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const x = t.dash.tracker;
  const { tz } = useTimezone();

  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [cue, setCue] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [obstacle, setObstacle] = useState("");
  const [stake, setStake] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Inside Telegram the header back button is where people reach for "out of
  // this"; without binding it, the system back gesture closes the whole Mini
  // App and the half-typed goal goes with it.
  useTelegramBack(true, onClose);
  useClosingConfirmation(
    !!(title.trim() || unit.trim() || target.trim() || cue.trim() || action.trim()),
  );

  const targetNum = Number(target);
  const valid =
    title.trim() !== "" && unit.trim() !== "" &&
    Number.isFinite(targetNum) && targetNum > 0 &&
    cue.trim() !== "" && action.trim() !== "";

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    const res = await trackerApi.createGoal({
      title: title.trim(),
      metric_unit: unit.trim(),
      target_value: targetNum,
      period,
      cue_when: cue.trim(),
      action_then: action.trim(),
      start_date: todayIn(tz),
      ends_on: endsOn || null,
      extras: {
        woop_outcome: outcome.trim() || undefined,
        woop_obstacle: obstacle.trim() || undefined,
        stake: stake.trim() || undefined,
      },
    });
    setBusy(false);
    if (res && "error" in res) { setErr(res.error); return; }
    haptic.success();
    onSaved();
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[11px] font-medium text-[var(--muted)] mb-1.5">{children}</div>
  );

  /** A named block, so the two required halves read as two decisions. */
  const Section = ({ n, title: heading, note, children }: {
    n: number; title: string; note: string; children: React.ReactNode;
  }) => (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-2)] p-3.5">
      <div className="flex items-center gap-2 mb-3">
        <span className="grid place-items-center h-5 w-5 shrink-0 rounded-full bg-[var(--muted-bg)] text-[10px] font-bold tabular-nums text-[var(--muted)]">
          {n}
        </span>
        <span className="text-xs font-semibold">{heading}</span>
        <span className="ml-auto text-[10px] text-[var(--muted)] shrink-0">{note}</span>
      </div>
      {children}
    </section>
  );

  // The plan assembled as the sentence it will actually be shown as — on the
  // card, and in the reminder. Seeing it form is the point of splitting it in
  // two, so it is worth the few lines.
  const preview = cue.trim() && action.trim()
    ? x.pvTemplate.replace("{cue}", cue.trim()).replace("{action}", action.trim())
    : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{x.formTitle}</DialogTitle>
          <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">{x.formLead}</p>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Section n={1} title={x.secWhat} note={x.required}>
            <Label>{x.fTitle}</Label>
            {/* No autoFocus on purpose: opening the form should not throw the
                keyboard over half the screen before anything has been read. */}
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={x.fTitlePh} />

            <div className="h-3" />
            <Label>{x.fTarget}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal" value={target}
                onChange={e => setTarget(e.target.value)} placeholder="5"
                className="w-20 tabular-nums"
              />
              <Input
                value={unit} onChange={e => setUnit(e.target.value)}
                placeholder={x.fMetricPh} className="flex-1 min-w-0"
              />
            </div>
            <div className="flex gap-1.5 mt-2">
              <Pill size="sm" active={period === "day"} onClick={() => setPeriod("day")}>{x.fPeriodDay}</Pill>
              <Pill size="sm" active={period === "week"} onClick={() => setPeriod("week")}>{x.fPeriodWeek}</Pill>
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-2 leading-snug">{x.fTargetHint}</div>
          </Section>

          {/* Two separate inputs on purpose — a single free-text box collapses
              back into a description and loses the "when" half. */}
          <Section n={2} title={x.secPlan} note={x.required}>
            <Label>{x.fCue}</Label>
            <Input value={cue} onChange={e => setCue(e.target.value)} placeholder={x.fCuePh} />
            <div className="h-3" />
            <Label>{x.fAction}</Label>
            <Input value={action} onChange={e => setAction(e.target.value)} placeholder={x.fActionPh} />

            <div className={[
              "mt-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed border",
              preview
                ? "bg-[var(--background)] border-[var(--card-border)] text-[var(--foreground)] font-medium"
                : "bg-transparent border-dashed border-[var(--card-border)] text-[var(--muted)]",
            ].join(" ")}>
              {preview ?? x.pvEmpty}
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-2 leading-snug">{x.fPlanHint}</div>
          </Section>

          {/* Folded, but not hidden: the heading says what is inside, so nobody
              has to discover it by chance. */}
          <section className="rounded-2xl border border-[var(--card-border)] p-3.5">
            <button
              type="button"
              onClick={() => setMore(v => !v)}
              className="w-full flex items-center gap-2 cursor-pointer text-left"
            >
              <span className="grid place-items-center h-5 w-5 shrink-0 rounded-full bg-[var(--muted-bg)] text-[var(--muted)]">
                {more ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </span>
              <span className="text-xs font-semibold">{x.secDepth}</span>
              <span className="ml-auto text-[10px] text-[var(--muted)] shrink-0">{x.optional}</span>
            </button>
            {!more && (
              <div className="text-[10px] text-[var(--muted)] mt-2 pl-7">{x.depthFields}</div>
            )}

            {more && (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <Label>{x.fOutcome}</Label>
                  <Textarea rows={2} value={outcome} onChange={e => setOutcome(e.target.value)} placeholder={x.fOutcomePh} />
                </div>
                <div>
                  <Label>{x.fObstacle}</Label>
                  <Textarea rows={2} value={obstacle} onChange={e => setObstacle(e.target.value)} placeholder={x.fObstaclePh} />
                  <div className="text-[10px] text-[var(--muted)] mt-1.5 leading-snug">{x.fObstacleHint}</div>
                </div>
                <div>
                  <Label>{x.targetDate}</Label>
                  <Input
                    type="date" value={endsOn}
                    onChange={e => setEndsOn(e.target.value)}
                    className="tabular-nums"
                  />
                  <div className="text-[10px] text-[var(--muted)] mt-1.5 leading-snug">{x.targetDateHint}</div>
                </div>
                <div>
                  <Label>{x.fStake}</Label>
                  <Input value={stake} onChange={e => setStake(e.target.value)} placeholder={x.fStakePh} />
                  <div className="text-[10px] text-[var(--muted)] mt-1.5 leading-snug">{x.fStakeHint}</div>
                </div>
              </div>
            )}
          </section>

          {err && <div className="text-[11px] text-red-500">{err}</div>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{x.cancel}</Button>
          <Button onClick={() => void save()} disabled={!valid || busy}>{x.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
