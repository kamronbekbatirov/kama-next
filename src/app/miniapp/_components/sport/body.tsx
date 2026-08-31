"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { todayIn, fmtDay, localeOf } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, EmptyState } from "../dashboard-ui";
import { haptic } from "@/lib/telegram-webapp";
import { sportApi, fmtSet } from "./api";
import type { Best, Measurement } from "./types";

/** Weight over time, and the heaviest thing lifted for each movement. */
export function SportBody({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t, lang } = useLang();
  const s = t.dash.sport;
  const { tz } = useTimezone();
  const day = todayIn(tz);

  const [rows, setRows] = useState<Measurement[]>([]);
  const [bests, setBests] = useState<Best[]>([]);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  const load = useCallback(() => {
    sportApi.body().then(r => {
      if (!Array.isArray(r)) return;
      setRows(r);
      const latest = r[0];
      if (latest?.height_cm) setHeight(String(latest.height_cm));
    }).catch(() => {});
    sportApi.bests().then(b => { if (Array.isArray(b)) setBests(b); }).catch(() => {});
  }, []);
  useEffect(load, [load, reloadKey]);

  const save = async () => {
    const w = weight.trim() ? Number(weight) : undefined;
    const h = height.trim() ? Number(height) : undefined;
    if (!w && !h) return;
    await sportApi.saveBody({ day, weight_kg: w, height_cm: h });
    haptic.success();
    setWeight("");
    load(); onChanged();
  };

  const latest = rows[0];
  const first = rows[rows.length - 1];
  const delta = latest?.weight_kg && first?.weight_kg && rows.length > 1
    ? Math.round((latest.weight_kg - first.weight_kg) * 10) / 10
    : null;

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionHeader
          eyebrow={s.tabs.body}
          trailing={delta !== null ? (
            <span className="text-[11px] tabular-nums text-[var(--muted)]">
              {delta > 0 ? "+" : ""}{delta} кг
            </span>
          ) : undefined}
        />
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)}
                   placeholder={`${s.weight}, кг`} className="flex-1 h-9 text-sm tabular-nums" />
            <Input type="number" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value)}
                   placeholder={`${s.height}, см`} className="w-24 h-9 text-sm tabular-nums" />
            <button onClick={() => void save()} disabled={!weight.trim() && !height.trim()}
              className="h-9 px-4 shrink-0 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold disabled:opacity-40 cursor-pointer">
              {s.saveBody}
            </button>
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-2 leading-snug">{s.bodyHint}</div>
        </Card>
      </section>

      {rows.length > 0 && (
        <Card className="p-2">
          <div className="flex flex-col gap-0.5">
            {rows.slice(0, 12).map(m => (
              <div key={m.day} className="flex items-center gap-3 py-1.5 px-2">
                <span className="text-[11px] text-[var(--muted)] w-20 shrink-0">
                  {fmtDay(m.day, localeOf(lang), { day: "numeric", month: "short" })}
                </span>
                <span className="text-sm tabular-nums flex-1">{m.weight_kg ?? "—"} кг</span>
                {m.height_cm && (
                  <span className="text-[11px] tabular-nums text-[var(--muted)]">{m.height_cm} см</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <section>
        <SectionHeader eyebrow={s.bests} />
        {bests.length === 0 ? (
          <Card><EmptyState title={s.noBests} /></Card>
        ) : (
          <Card className="p-2">
            <div className="flex flex-col gap-0.5">
              {bests.map(b => (
                <div key={b.name} className="flex items-center gap-3 py-1.5 px-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{b.name}</span>
                  <span className="text-xs tabular-nums shrink-0">{fmtSet(b)}</span>
                  <span className="text-[10px] text-[var(--muted)] shrink-0">
                    {fmtDay(b.day, localeOf(lang), { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
