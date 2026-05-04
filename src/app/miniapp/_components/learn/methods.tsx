"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2, Target, Clock3, Sparkles, Lightbulb, Users, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useLang } from "@/components/providers";
import { learnApi } from "./api";
import type { LearnMethodEntry, MethodKind } from "./types";

const METHOD_META: { kind: MethodKind; icon: ReactNode; tone: string }[] = [
  { kind: "woop", icon: <Sparkles className="h-5 w-5" />, tone: "from-rose-500/10 to-pink-500/5" },
  { kind: "two_minute", icon: <Clock3 className="h-5 w-5" />, tone: "from-blue-500/10 to-sky-500/5" },
  { kind: "if_then", icon: <Lightbulb className="h-5 w-5" />, tone: "from-emerald-500/10 to-green-500/5" },
  { kind: "goal", icon: <Target className="h-5 w-5" />, tone: "from-violet-500/10 to-fuchsia-500/5" },
  { kind: "commitment", icon: <Users className="h-5 w-5" />, tone: "from-amber-500/10 to-orange-500/5" },
  { kind: "intrinsic", icon: <Heart className="h-5 w-5" />, tone: "from-cyan-500/10 to-teal-500/5" },
];

export function MethodsPane() {
  const { t } = useLang();
  const l = t.dash.learn;
  const [entries, setEntries] = useState<LearnMethodEntry[]>([]);
  const [open, setOpen] = useState<MethodKind | null>(null);
  const [editing, setEditing] = useState<LearnMethodEntry | null>(null);

  const refresh = async () => {
    const data = await learnApi.listMethods();
    setEntries(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const grouped = (kind: MethodKind) => entries.filter((e) => e.method === kind);

  return (
    <>
      <div className="flex flex-col gap-3">
        {METHOD_META.map((m) => {
          const items = grouped(m.kind);
          return (
            <Card key={m.kind} className={`bg-gradient-to-br ${m.tone}`}>
              <div className="flex items-start gap-3 mb-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                  {m.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{l.methods[m.kind].title}</div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5 leading-tight">
                    {l.methods[m.kind].subtitle}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setOpen(m.kind)}>
                  <Plus className="h-3.5 w-3.5" />
                  {l.add}
                </Button>
              </div>
              {items.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {items.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEditing(e)}
                      className="text-left rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--card-border)] px-3 py-2 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold truncate">
                          {e.title || methodSummary(e)}
                        </div>
                        <span className="text-[9px] text-[var(--muted)] uppercase tracking-wider shrink-0">
                          {new Date(e.created_at).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {open && (
        <MethodDialog
          method={open}
          entry={null}
          onClose={() => setOpen(null)}
          onSaved={async () => {
            setOpen(null);
            await refresh();
          }}
        />
      )}

      {editing && (
        <MethodDialog
          method={editing.method}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
          onDeleted={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function methodSummary(e: LearnMethodEntry): string {
  const d = e.data as Record<string, string | undefined>;
  switch (e.method) {
    case "woop":
      return d.wish || "—";
    case "two_minute":
      return `${d.trigger ?? "—"} → ${d.action ?? "—"}`;
    case "if_then":
      return `If ${d.if_part ?? "—"} → ${d.then_part ?? "—"}`;
    case "goal":
      return d.title ?? "—";
    case "commitment":
      return d.statement ?? "—";
    case "intrinsic":
      return d.why ?? "—";
  }
}

function MethodDialog({
  method,
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  method: MethodKind;
  entry: LearnMethodEntry | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const initial = (entry?.data as Record<string, string>) ?? {};
  const [data, setData] = useState<Record<string, string>>(initial);
  const [title, setTitle] = useState(entry?.title ?? "");

  const set = (k: string) => (v: string) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (entry) {
      await learnApi.updateMethod(entry.id, { title, data });
    } else {
      await learnApi.createMethod({ method, title, data });
    }
    onSaved();
  };

  const remove = async () => {
    if (!entry || !onDeleted) return;
    if (!confirm(l.methods.confirmDelete)) return;
    await learnApi.deleteMethod(entry.id);
    onDeleted();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{l.methods[method].title}</DialogTitle>
          <p className="text-xs text-[var(--muted)] mt-1">{l.methods[method].subtitle}</p>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={l.methods.titlePh}
          />
          <Separator />
          {method === "woop" && (
            <>
              <FieldLabel label={l.methods.woop.wish} />
              <Input value={data.wish ?? ""} onChange={(e) => set("wish")(e.target.value)} placeholder={l.methods.woop.wishPh} />
              <FieldLabel label={l.methods.woop.outcome} />
              <Textarea rows={2} value={data.outcome ?? ""} onChange={(e) => set("outcome")(e.target.value)} placeholder={l.methods.woop.outcomePh} />
              <FieldLabel label={l.methods.woop.obstacle} />
              <Input value={data.obstacle ?? ""} onChange={(e) => set("obstacle")(e.target.value)} placeholder={l.methods.woop.obstaclePh} />
              <FieldLabel label={l.methods.woop.plan} />
              <Input value={data.plan ?? ""} onChange={(e) => set("plan")(e.target.value)} placeholder={l.methods.woop.planPh} />
            </>
          )}
          {method === "two_minute" && (
            <>
              <FieldLabel label={l.methods.two_minute.trigger} />
              <Input value={data.trigger ?? ""} onChange={(e) => set("trigger")(e.target.value)} placeholder={l.methods.two_minute.triggerPh} />
              <FieldLabel label={l.methods.two_minute.action} />
              <Input value={data.action ?? ""} onChange={(e) => set("action")(e.target.value)} placeholder={l.methods.two_minute.actionPh} />
            </>
          )}
          {method === "if_then" && (
            <>
              <FieldLabel label={l.methods.if_then.if_part} />
              <Input value={data.if_part ?? ""} onChange={(e) => set("if_part")(e.target.value)} placeholder={l.methods.if_then.ifPh} />
              <FieldLabel label={l.methods.if_then.then_part} />
              <Input value={data.then_part ?? ""} onChange={(e) => set("then_part")(e.target.value)} placeholder={l.methods.if_then.thenPh} />
            </>
          )}
          {method === "goal" && (
            <>
              <FieldLabel label={l.methods.goal.what} />
              <Input value={data.what ?? ""} onChange={(e) => set("what")(e.target.value)} placeholder={l.methods.goal.whatPh} />
              <FieldLabel label={l.methods.goal.metric} />
              <Input value={data.metric ?? ""} onChange={(e) => set("metric")(e.target.value)} placeholder={l.methods.goal.metricPh} />
              <FieldLabel label={l.methods.goal.deadline} />
              <Input type="date" value={data.deadline ?? ""} onChange={(e) => set("deadline")(e.target.value)} />
              <FieldLabel label={l.methods.goal.progress} />
              <Input type="number" min="0" max="100" value={data.progress ?? "0"} onChange={(e) => set("progress")(e.target.value)} />
            </>
          )}
          {method === "commitment" && (
            <>
              <FieldLabel label={l.methods.commitment.statement} />
              <Textarea rows={2} value={data.statement ?? ""} onChange={(e) => set("statement")(e.target.value)} placeholder={l.methods.commitment.statementPh} />
              <FieldLabel label={l.methods.commitment.partner} />
              <Input value={data.partner ?? ""} onChange={(e) => set("partner")(e.target.value)} placeholder={l.methods.commitment.partnerPh} />
              <FieldLabel label={l.methods.commitment.cadence} />
              <Input value={data.cadence ?? ""} onChange={(e) => set("cadence")(e.target.value)} placeholder={l.methods.commitment.cadencePh} />
              <FieldLabel label={l.methods.commitment.stake} />
              <Input value={data.stake ?? ""} onChange={(e) => set("stake")(e.target.value)} placeholder={l.methods.commitment.stakePh} />
            </>
          )}
          {method === "intrinsic" && (
            <>
              <FieldLabel label={l.methods.intrinsic.why} />
              <Textarea rows={3} value={data.why ?? ""} onChange={(e) => set("why")(e.target.value)} placeholder={l.methods.intrinsic.whyPh} />
              <FieldLabel label={l.methods.intrinsic.autonomy} />
              <Input value={data.autonomy ?? ""} onChange={(e) => set("autonomy")(e.target.value)} placeholder={l.methods.intrinsic.autonomyPh} />
              <FieldLabel label={l.methods.intrinsic.competence} />
              <Input value={data.competence ?? ""} onChange={(e) => set("competence")(e.target.value)} placeholder={l.methods.intrinsic.competencePh} />
              <FieldLabel label={l.methods.intrinsic.relatedness} />
              <Input value={data.relatedness ?? ""} onChange={(e) => set("relatedness")(e.target.value)} placeholder={l.methods.intrinsic.relatednessPh} />
            </>
          )}
        </div>

        <DialogFooter>
          {entry && (
            <Button variant="outline" onClick={remove} className="mr-auto">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {l.cancel}
          </Button>
          <Button onClick={save}>{l.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="self-start mt-1">
      {label}
    </Badge>
  );
}
