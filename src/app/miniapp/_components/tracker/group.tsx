"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useLang } from "@/components/providers";
import { todayIn } from "../_shared";
import { useTimezone } from "../timezone";
import { SectionHeader, EmptyState } from "../dashboard-ui";
import { Avatar } from "./avatar";
import { trackerApi } from "./api";
import type { Board } from "./types";

/**
 * The shared board — the first screen on purpose.
 *
 * Progress that other people can see is the mechanism this feature is built on,
 * and comparison is what the research found does the work, so everyone's bars
 * sit side by side. What is deliberately absent: any red, any cross, any
 * "streak lost" state. A missed day is drawn as an empty dot, because a gap in
 * a habit is ordinary and framing it as failure is what makes people quit.
 */
export function GroupPane({ meId }: { meId: string | null }) {
  const { t } = useLang();
  const x = t.dash.tracker;
  const { tz } = useTimezone();
  const [board, setBoard] = useState<Board | null>(null);
  const end = todayIn(tz);

  useEffect(() => {
    trackerApi.board(end, 30).then(b => { if (b && Array.isArray(b.goals)) setBoard(b); });
  }, [end]);

  if (!board) return <div className="py-10 text-center text-xs text-[var(--muted)]">…</div>;

  const maxWeek = Math.max(1, ...board.week.map(w => w.done));

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionHeader eyebrow={x.weekTitle} />
        <Card className="p-3">
          <div className="flex flex-col gap-2.5">
            {board.week.map(w => (
              <div key={w.member_id} className="flex items-center gap-2.5">
                <Avatar memberId={w.member_id} name={w.display_name} hasPhoto={w.has_photo}
                        colorIndex={w.avatar_color} size={26} />
                <span className={[
                  "text-xs w-20 shrink-0 truncate",
                  w.member_id === meId ? "font-semibold" : "",
                ].join(" ")}>
                  {w.display_name}
                </span>
                <div className="flex-1">
                  <Progress value={(w.done / maxWeek) * 100} />
                </div>
                <span className="text-xs tabular-nums w-6 text-right font-semibold">{w.done}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-2.5">{x.weekHint}</div>
        </Card>
      </section>

      <section>
        <SectionHeader eyebrow={x.boardTitle} />
        {board.goals.length === 0 ? (
          <Card><EmptyState icon={<Users className="h-8 w-8" />} title={x.boardEmpty} /></Card>
        ) : (
          <div className="flex flex-col gap-2">
            {board.goals.map(g => (
              <Card key={g.goal_id} className="p-3">
                <div className="flex items-center gap-2">
                  <Avatar memberId={g.member_id} name={g.display_name} hasPhoto={g.has_photo}
                    colorIndex={g.avatar_color} size={20} />
                  <span className={[
                    "text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] truncate",
                    g.member_id === meId ? "text-[var(--foreground)] font-semibold" : "",
                  ].join(" ")}>
                    {g.display_name}
                  </span>
                  {g.current_run > 0 && (
                    <span className="ml-auto text-[10px] tabular-nums text-[var(--muted)] shrink-0">
                      {g.current_run} {x.run}
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold mt-0.5 truncate">{g.title}</div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1">
                    <Progress value={(g.days_done_7 / 7) * 100} />
                  </div>
                  <span className="text-[10px] tabular-nums text-[var(--muted)] shrink-0">
                    {g.days_done_7}/7 · {x.last7}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-1.5 tabular-nums">
                  {g.days_done_30} · {x.last30} · {g.target_value} {g.metric_unit}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
