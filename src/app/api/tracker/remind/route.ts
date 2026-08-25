import { dueReminders, markReminded } from "@/lib/tracker";
import { getTimezone } from "@/lib/timezone";
import { tgSendMessage } from "@/lib/telegram";
import { requireOwner, UNAUTHORIZED } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * Send trigger-time reminders. Driven by a systemd timer, exactly like the
 * inbox sync — same shared-secret header, so there is no new runtime to run.
 *
 * The message quotes the person's own if-then plan. That is deliberate: the
 * plan is the intervention, and re-encountering it at the moment it applies is
 * the whole point. What it must never do is scold — no "you're behind", no
 * streak talk. If they already checked in today they are not messaged at all.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOX_INGEST_SECRET;
  const keyed = !!secret && req.headers.get("x-inbox-key") === secret;
  if (!keyed) {
    try { await requireOwner(); } catch { return UNAUTHORIZED(); }
  }

  try {
    const defaultTz = await getTimezone();
    const due = await dueReminders(defaultTz);
    let sent = 0;

    for (const r of due) {
      if (!r.telegram_id) continue;
      const text =
        `⏰ ${r.title}\n\n` +
        `Когда ${r.cue_when} — ${r.action_then}.\n` +
        `Сегодня: ${r.target_value} ${r.metric_unit}.`;
      const res = await tgSendMessage(r.telegram_id, text, {
        link_preview_options: { is_disabled: true },
      }).catch(() => ({ ok: false }));
      // Stamp regardless of delivery: a blocked chat should not make the timer
      // retry the same nudge every few minutes for the rest of the day.
      await markReminded(r.goal_id, defaultTz);
      if (res.ok) sent++;
    }

    return Response.json({ ok: true, due: due.length, sent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tracker/remind:", msg);
    return Response.json({ ok: false, error: "error" }, { status: 500 });
  }
}
