"use client";

import { useEffect, useState } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLang } from "@/components/providers";
import { learnApi } from "./api";
import type { LearnMethodEntry } from "./types";

interface GoalData {
  what?: string;
  metric?: string;
  deadline?: string;
  progress?: string;
}

export function GoalsPane() {
  const { t } = useLang();
  const l = t.dash.learn;
  const [goals, setGoals] = useState<LearnMethodEntry[]>([]);
  const [editing, setEditing] = useState<LearnMethodEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    const data = await learnApi.listMethods("goal");
    setGoals(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
            {l.goals.subtitle}
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            {l.goals.new}
          </Button>
        </div>

        {goals.length === 0 ? (
          <Card className="text-center py-10">
            <Target className="h-8 w-8 mx-auto text-[var(--muted)] mb-2" />
            <div className="text-sm font-semibold">{l.goals.emptyTitle}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{l.goals.emptyHint}</div>
          </Card>
        ) : (
          goals.map((g) => {
            const d = g.data as GoalData;
            const progress = Math.min(100, Math.max(0, Number(d.progress ?? "0")));
            const dl = d.deadline ? new Date(d.deadline) : null;
            const daysLeft = dl ? Math.ceil((dl.getTime() - Date.now()) / 86400000) : null;
            return (
              <button
                key={g.id}
                onClick={() => setEditing(g)}
                className="text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-soft hover:shadow-pop transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{g.title || d.what || "—"}</div>
                    {d.metric && (
                      <div className="text-xs text-[var(--muted)] mt-0.5">{d.metric}</div>
                    )}
                  </div>
                  {daysLeft !== null && (
                    <Badge variant={daysLeft < 0 ? "danger" : daysLeft < 7 ? "warning" : "outline"}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}d ${l.goals.overdue}` : `${daysLeft}d`}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <Progress value={progress} />
                  </div>
                  <div className="text-[10px] tabular-nums font-bold text-[var(--muted)]">
                    {progress}%
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {(creating || editing) && (
        <GoalDialog
          entry={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
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

function GoalDialog({
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: LearnMethodEntry | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const initial = (entry?.data as GoalData) ?? {};
  const [data, setData] = useState<GoalData>(initial);
  const [title, setTitle] = useState(entry?.title ?? "");
  const set = (k: keyof GoalData) => (v: string) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (entry) {
      await learnApi.updateMethod(entry.id, { title, data: data as Record<string, unknown> });
    } else {
      await learnApi.createMethod({ method: "goal", title, data: data as Record<string, unknown> });
    }
    onSaved();
  };

  const remove = async () => {
    if (!entry) return;
    if (!confirm(l.methods.confirmDelete)) return;
    await learnApi.deleteMethod(entry.id);
    onDeleted();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{entry ? l.goals.edit : l.goals.new}</DialogTitle>
          <p className="text-xs text-[var(--muted)] mt-1">{l.methods.goal.subtitle}</p>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={l.methods.titlePh}
          />
          <Badge variant="outline" className="self-start mt-1">{l.methods.goal.what}</Badge>
          <Textarea
            rows={2}
            value={data.what ?? ""}
            onChange={(e) => set("what")(e.target.value)}
            placeholder={l.methods.goal.whatPh}
          />
          <Badge variant="outline" className="self-start mt-1">{l.methods.goal.metric}</Badge>
          <Input
            value={data.metric ?? ""}
            onChange={(e) => set("metric")(e.target.value)}
            placeholder={l.methods.goal.metricPh}
          />
          <Badge variant="outline" className="self-start mt-1">{l.methods.goal.deadline}</Badge>
          <Input
            type="date"
            value={data.deadline ?? ""}
            onChange={(e) => set("deadline")(e.target.value)}
          />
          <Badge variant="outline" className="self-start mt-1">{l.methods.goal.progress}</Badge>
          <Input
            type="number"
            min="0"
            max="100"
            value={data.progress ?? "0"}
            onChange={(e) => set("progress")(e.target.value)}
          />
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
