"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { tgConfirm } from "@/lib/telegram-webapp";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { GroupPane } from "./group";
import { MinePane } from "./mine";
import { GoalForm } from "./goal-form";
import { trackerApi } from "./api";
import type { Goal } from "./types";

/**
 * The tracker, used by both shells: the guest's own page and the owner's
 * sub-tab inside Tasks.
 *
 * One page, no sub-tabs. Your own goals come first because they are the only
 * thing here you act on, and the group sits directly underneath because seeing
 * it is the mechanism the whole feature rests on — a tab you have to choose is
 * a tab you stop choosing.
 */
export function TrackerTab({ meId = null }: { meId?: string | null }) {
  const { t } = useLang();
  const x = t.dash.tracker;
  const [forming, setForming] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [reload, setReload] = useState(0);
  const bump = useCallback(() => setReload(n => n + 1), []);

  const [archived, setArchived] = useState<Goal[]>([]);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    trackerApi.listArchived()
      .then(r => { if (Array.isArray(r)) setArchived(r); })
      .catch(() => {});
  }, [reload]);

  const restore = async (id: number) => {
    await trackerApi.restoreGoal(id);
    bump();
  };

  const purge = async (g: Goal) => {
    const msg = g.checkins_total || g.steps_total
      ? x.deleteConfirm
          .replace("{name}", g.title)
          .replace("{c}", String(g.checkins_total))
          .replace("{s}", String(g.steps_total))
      : x.deleteConfirmPlain.replace("{name}", g.title);
    if (!(await tgConfirm(msg))) return;
    await trackerApi.deleteGoal(g.id);
    bump();
  };

  return (
    <div className="flex flex-col gap-5 pt-2 animate-fade-in">
      <MinePane onNew={() => setForming(true)} onEdit={setEditing} reloadKey={reload} onChanged={bump} />

      <GroupPane key={reload} meId={meId} />

      {/* Archiving used to be a one-way door: the goal left every list and
          there was no route back to it. */}
      {archived.length > 0 && (
        <section>
          <button
            onClick={() => setShowArchive(v => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            {showArchive ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {x.archiveShow.replace("{n}", String(archived.length))}
          </button>

          {showArchive && (
            <Card className="p-2 mt-2">
              <div className="flex flex-col gap-0.5">
                {archived.map(g => (
                  <div key={g.id} className="flex items-center gap-3 py-2 px-2 rounded-xl">
                    <span className="text-sm flex-1 min-w-0 truncate text-[var(--muted)]">{g.title}</span>
                    <span className="text-[10px] tabular-nums text-[var(--muted)] shrink-0">
                      {g.target_value} {g.metric_unit}
                    </span>
                    <button
                      onClick={() => void restore(g.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer shrink-0"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" /> {x.restore}
                    </button>
                    <button
                      onClick={() => void purge(g)}
                      aria-label={x.deleteGoal}
                      className="text-[var(--muted)] hover:text-red-500 transition-colors cursor-pointer shrink-0 p-1 -m-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>
      )}

      {(forming || editing) && (
        <GoalForm
          goal={editing}
          onClose={() => { setForming(false); setEditing(null); }}
          onSaved={() => { setForming(false); setEditing(null); bump(); }}
        />
      )}
    </div>
  );
}
