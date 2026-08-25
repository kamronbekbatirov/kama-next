"use client";

import { useState } from "react";
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
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      extras: {
        woop_outcome: outcome.trim() || undefined,
        woop_obstacle: obstacle.trim() || undefined,
        stake: stake.trim() || undefined,
      },
    });
    setBusy(false);
    if (res && "error" in res) { setErr(res.error); return; }
    onSaved();
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">
      {children}
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{x.formTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <Label>{x.fTitle}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={x.fTitlePh} autoFocus />
          </div>

          <div>
            <Label>{x.fTarget}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal" value={target}
                onChange={e => setTarget(e.target.value)} placeholder="5"
                className="w-24 tabular-nums"
              />
              <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder={x.fMetricPh} className="flex-1" />
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-1.5 leading-snug">{x.fTargetHint}</div>
          </div>

          <div>
            <Label>{x.fPeriod}</Label>
            <div className="flex gap-1.5">
              <Pill size="sm" active={period === "day"} onClick={() => setPeriod("day")}>{x.fPeriodDay}</Pill>
              <Pill size="sm" active={period === "week"} onClick={() => setPeriod("week")}>{x.fPeriodWeek}</Pill>
            </div>
          </div>

          {/* Two separate inputs on purpose — a single free-text box collapses
              back into a description and loses the "when" half. */}
          <div className="rounded-xl border border-[var(--card-border)] p-3">
            <Label>{x.fCue}</Label>
            <Input value={cue} onChange={e => setCue(e.target.value)} placeholder={x.fCuePh} />
            <div className="h-2" />
            <Label>{x.fAction}</Label>
            <Input value={action} onChange={e => setAction(e.target.value)} placeholder={x.fActionPh} />
            <div className="text-[10px] text-[var(--muted)] mt-2 leading-snug">{x.fPlanHint}</div>
          </div>

          {/* Everything below is optional and folded away. The required half
              above is what a goal cannot exist without; this is the part that
              rewards people who want to think it through. */}
          <div>
            <button
              type="button"
              onClick={() => setMore(v => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
            >
              {more ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {x.more}
            </button>

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
                  <Label>{x.fStake}</Label>
                  <Input value={stake} onChange={e => setStake(e.target.value)} placeholder={x.fStakePh} />
                  <div className="text-[10px] text-[var(--muted)] mt-1.5 leading-snug">{x.fStakeHint}</div>
                </div>
              </div>
            )}
          </div>

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
