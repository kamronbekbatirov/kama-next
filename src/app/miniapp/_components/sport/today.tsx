"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { todayIn } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, Pill } from "../dashboard-ui";
import { haptic, tgConfirm } from "@/lib/telegram-webapp";
import { sportApi, fmtSet } from "./api";
import type { Exercise, Workout } from "./types";

/**
 * Today's session.
 *
 * The programme is the list to tap from, so logging a set is picking a movement
 * you already planned rather than typing its name. Paused movements are shown
 * but not tappable — the reason they are on hold does not stop applying because
 * you are in the gym.
 */
export function SportToday({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const s = t.dash.sport;
  const { tz } = useTimezone();
  const day = todayIn(tz);

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [program, setProgram] = useState<Exercise[]>([]);
  const [picked, setPicked] = useState<Exercise | null>(null);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [seconds, setSeconds] = useState("");

  const load = useCallback(() => {
    sportApi.dayWorkout(day).then(w => setWorkout(w && "id" in w ? w : null)).catch(() => {});
    sportApi.program().then(p => { if (Array.isArray(p)) setProgram(p); }).catch(() => {});
  }, [day]);
  useEffect(load, [load, reloadKey]);

  const start = async (kind: string) => {
    await sportApi.start(day, kind);
    haptic.tap();
    load(); onChanged();
  };

  const log = async () => {
    if (!workout || !picked) return;
    const n = (v: string) => v.trim() ? Number(v) : null;
    await sportApi.addSet(workout.id, {
      name: picked.name, exercise_id: picked.id,
      reps: n(reps), weight_kg: n(weight), seconds: n(seconds),
    });
    haptic.success();
    setReps(""); setWeight(""); setSeconds("");
    load(); onChanged();
  };

  const kinds = ["gym", "home", "cardio"] as const;
  const relevant = program.filter(e =>
    workout?.kind === "home" ? ["home", "warmup", "stretch", "posture"].includes(e.block)
                             : ["main", "warmup", "stretch", "posture", "cardio"].includes(e.block));

  if (!workout) {
    return (
      <Card className="p-5 text-center">
        <div className="text-[11px] text-[var(--muted)] mb-3">{s.noWorkout}</div>
        <div className="flex gap-1.5 justify-center flex-wrap">
          {kinds.map(k => (
            <Pill key={k} size="sm" onClick={() => void start(k)}>{s.kinds[k]}</Pill>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionHeader
          eyebrow={s.kinds[workout.kind as "gym"] ?? workout.kind}
          trailing={
            <button
              onClick={async () => {
                if (!(await tgConfirm(s.deleteWorkout + "?"))) return;
                await sportApi.removeWorkout(workout.id);
                load(); onChanged();
              }}
              className="text-[11px] text-[var(--muted)] hover:text-red-500 cursor-pointer">
              {s.deleteWorkout}
            </button>
          }
        />
        <Card className="p-2">
          {workout.sets.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-[var(--muted)]">—</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {workout.sets.map(st => (
                <div key={st.id} className="flex items-center gap-3 py-1.5 px-2">
                  <span className="text-[10px] tabular-nums text-[var(--muted)] w-4 shrink-0">{st.set_no}</span>
                  <span className="text-sm flex-1 min-w-0 truncate">{st.name}</span>
                  <span className="text-xs tabular-nums shrink-0">{fmtSet(st)}</span>
                  <button onClick={async () => { await sportApi.removeSet(st.id); load(); onChanged(); }}
                    aria-label={s.remove}
                    className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-red-500 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader eyebrow={s.addSet} />
        <Card className="p-3">
          <div className="flex gap-1.5 flex-wrap mb-2.5 max-h-32 overflow-y-auto">
            {relevant.map(e => (
              <Pill
                key={e.id} size="sm"
                active={picked?.id === e.id}
                onClick={() => { if (!e.paused) setPicked(e); }}
              >
                {e.paused ? `⏸ ${e.name}` : e.name}
              </Pill>
            ))}
          </div>

          {picked?.paused_reason && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">{picked.paused_reason}</div>
          )}

          <div className="flex items-center gap-2">
            <Input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)}
                   placeholder={s.setWeight} className="w-20 h-9 text-sm tabular-nums" />
            <Input type="number" inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)}
                   placeholder={s.setReps} className="w-20 h-9 text-sm tabular-nums" />
            <Input type="number" inputMode="numeric" value={seconds} onChange={e => setSeconds(e.target.value)}
                   placeholder={s.setSeconds} className="w-20 h-9 text-sm tabular-nums" />
            <button onClick={() => void log()} disabled={!picked}
              className="h-9 px-3 ml-auto shrink-0 rounded-xl bg-[var(--foreground)] text-[var(--background)] disabled:opacity-40 cursor-pointer">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {picked && (
            <div className="text-[10px] text-[var(--muted)] mt-1.5">
              {picked.name}{picked.sets || picked.reps ? ` · ${picked.sets ?? ""}${picked.sets && picked.reps ? " × " : ""}${picked.reps ?? ""}` : ""}
              {picked.note ? ` · ${picked.note}` : ""}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
