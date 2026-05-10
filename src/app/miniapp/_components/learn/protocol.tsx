"use client";

import { useEffect, useState } from "react";
import { Clock, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/components/providers";
import { learnApi } from "./api";
import type { ReviewQueueItem } from "./types";

export function ProtocolPane() {
  const { t } = useLang();
  const l = t.dash.learn;
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);

  useEffect(() => {
    learnApi.reviewQueue().then((rows) => setQueue(Array.isArray(rows) ? rows : []));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Today's review queue */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-yellow-500" />
          <div className="text-sm font-bold">{l.protocol.queueTitle}</div>
          <Badge variant={queue.length ? "warning" : "outline"} className="ml-auto">
            {queue.length}
          </Badge>
        </div>
        {queue.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-[var(--muted)] py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {l.protocol.queueEmpty}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {queue.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--card-border)]"
              >
                <span className="text-base">{n.subject_emoji || "📘"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{n.title}</div>
                  <div className="text-[10px] text-[var(--muted)]">{n.subject_title}</div>
                </div>
                <Badge variant="warning" className="text-[10px]">
                  {l.protocol.due}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 6-step protocol */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2 px-1">
          {l.protocol.stepsTitle}
        </div>
        <div className="flex flex-col gap-2">
          {l.protocol.steps.map((s: { num: string; title: string; body: string }) => (
            <Card key={s.num} className="flex gap-3 items-start">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center text-sm font-black">
                {s.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{s.title}</div>
                <div className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{s.body}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>

    </div>
  );
}
