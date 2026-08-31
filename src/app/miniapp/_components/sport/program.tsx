"use client";

import { useCallback, useEffect, useState } from "react";
import { PauseCircle, Pencil, PlayCircle, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { SectionHeader } from "../dashboard-ui";
import { tgConfirm } from "@/lib/telegram-webapp";
import { sportApi } from "./api";
import type { Block, Exercise } from "./types";
import { BLOCKS } from "./types";

/**
 * The programme.
 *
 * A paused movement stays in the list rather than disappearing, with its reason
 * on the card: some of these are on hold because they cause numbness, and a
 * movement that simply vanished would read as "done with" instead of "not until
 * a doctor says so".
 */
export function SportProgram({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const s = t.dash.sport;
  const [rows, setRows] = useState<Exercise[]>([]);
  const [adding, setAdding] = useState<Block | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", sets: "", reps: "", note: "" });

  const load = useCallback(() => {
    sportApi.program().then(r => { if (Array.isArray(r)) setRows(r); }).catch(() => {});
  }, []);
  useEffect(load, [load, reloadKey]);

  const togglePause = async (e: Exercise) => {
    // No reason is asked for or shown: "on hold" is the whole message, and why
    // it is on hold is his business, not the interface's.
    await sportApi.pauseExercise(e.id, !e.paused);
    load(); onChanged();
  };

  const remove = async (e: Exercise) => {
    if (!(await tgConfirm(s.removeConfirm.replace("{name}", e.name)))) return;
    await sportApi.deleteExercise(e.id);
    load(); onChanged();
  };

  const beginEdit = (e: Exercise) => {
    setAdding(null);
    setEditing(e.id);
    setDraft({ name: e.name, sets: e.sets ?? "", reps: e.reps ?? "", note: e.note ?? "" });
  };

  const saveEdit = async (e: Exercise) => {
    if (!draft.name.trim()) return;
    await sportApi.saveExercise({
      id: e.id, block: e.block, name: draft.name.trim(),
      sets: draft.sets.trim() || null, reps: draft.reps.trim() || null,
      note: draft.note.trim() || null,
    });
    setEditing(null);
    load(); onChanged();
  };

  const add = async (block: Block) => {
    if (!draft.name.trim()) return;
    await sportApi.saveExercise({
      block, name: draft.name.trim(),
      sets: draft.sets.trim() || null, reps: draft.reps.trim() || null,
      note: draft.note.trim() || null,
    });
    setDraft({ name: "", sets: "", reps: "", note: "" });
    setAdding(null);
    load(); onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      {BLOCKS.map(block => {
        const list = rows.filter(r => r.block === block);
        if (list.length === 0 && adding !== block) return null;
        return (
          <section key={block}>
            <SectionHeader
              eyebrow={s.blocks[block]}
              trailing={
                <button onClick={() => setAdding(adding === block ? null : block)}
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
                  <Plus className="h-3.5 w-3.5" /> {s.addExercise}
                </button>
              }
            />
            <Card className="p-2">
              <div className="flex flex-col gap-0.5">
                {list.map(e => editing === e.id ? (
                  <div key={e.id} className="py-2 px-2 rounded-xl bg-[var(--surface-2)] flex flex-col gap-1.5">
                    <Input value={draft.name} className="h-9 text-sm"
                           onChange={ev => setDraft(d => ({ ...d, name: ev.target.value }))} />
                    <div className="flex items-center gap-2">
                      <Input value={draft.sets} placeholder={s.exSets} className="w-20 h-9 text-sm"
                             onChange={ev => setDraft(d => ({ ...d, sets: ev.target.value }))} />
                      <Input value={draft.reps} placeholder={s.exReps} className="flex-1 h-9 text-sm"
                             onChange={ev => setDraft(d => ({ ...d, reps: ev.target.value }))} />
                    </div>
                    <Input value={draft.note} placeholder={s.exNote} className="h-9 text-sm"
                           onChange={ev => setDraft(d => ({ ...d, note: ev.target.value }))} />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setEditing(null)}
                        className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
                        {t.dash.food.cancel}
                      </button>
                      <button onClick={() => void saveEdit(e)} disabled={!draft.name.trim()}
                        className="h-8 px-3 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-[11px] font-semibold disabled:opacity-40 cursor-pointer">
                        {s.saveBody}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={e.id} className={["py-2 px-2 rounded-xl", e.paused ? "opacity-60" : ""].join(" ")}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex-1 min-w-0 truncate">{e.name}</span>
                      {!e.paused && (e.sets || e.reps) && (
                        <span className="text-[11px] tabular-nums text-[var(--muted)] shrink-0">
                          {e.sets}{e.sets && e.reps ? " × " : ""}{e.reps}
                        </span>
                      )}
                      {e.paused && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-500 shrink-0">
                          {s.paused}
                        </span>
                      )}
                      <button onClick={() => beginEdit(e)} aria-label={s.edit}
                        className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => void togglePause(e)}
                        aria-label={e.paused ? s.unpause : s.pause}
                        className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
                        {e.paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => void remove(e)} aria-label={s.remove}
                        className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-red-500 cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {e.note && (
                      <div className="text-[10px] mt-0.5 leading-snug text-[var(--muted)]">{e.note}</div>
                    )}
                  </div>
                ))}
              </div>

              {adding === block && (
                <div className="mt-2 pt-2 border-t border-[var(--card-border)] flex flex-col gap-1.5">
                  <Input value={draft.name} placeholder={s.exName} className="h-9 text-sm"
                         onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <Input value={draft.sets} placeholder={s.exSets} className="w-20 h-9 text-sm"
                           onChange={e => setDraft(d => ({ ...d, sets: e.target.value }))} />
                    <Input value={draft.reps} placeholder={s.exReps} className="flex-1 h-9 text-sm"
                           onChange={e => setDraft(d => ({ ...d, reps: e.target.value }))} />
                    <button onClick={() => void add(block)} disabled={!draft.name.trim()}
                      className="h-9 px-3 shrink-0 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold disabled:opacity-40 cursor-pointer">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <Input value={draft.note} placeholder={s.exNote} className="h-9 text-sm"
                         onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
                </div>
              )}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
