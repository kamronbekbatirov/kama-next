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
    let blocked = 0;

    for (const r of due) {
      if (!r.telegram_id) continue;
      const text =
        `⏰ ${r.title}\n\n` +
        `Когда ${r.cue_when} — ${r.action_then}.\n` +
        `Сегодня: ${r.target_value} ${r.metric_unit}.`;
      const res: { ok: boolean; description?: string } = await tgSendMessage(
        r.telegram_id, text, { link_preview_options: { is_disabled: true } },
      ).catch(() => ({ ok: false, description: "request failed" }));
      // Stamp regardless of delivery: a blocked chat should not make the timer
      // retry the same nudge every few minutes for the rest of the day.
      await markReminded(r.goal_id, defaultTz);
      if (res.ok) { sent++; continue; }

      // A bot cannot open a conversation the user never started, and cannot
      // reach one who blocked it. Both are permanent, and both look exactly
      // like "reminders don't work" from the outside, so name them in the log
      // rather than counting a silent failure. The Mini App asks for write
      // access before accepting a reminder, so reaching here means the person
      // revoked it or never used the Mini App to set it.
      const why = res.description ?? "unknown";
      const permanent = /blocked|can't initiate|cannot initiate|deactivated|chat not found/i.test(why);
      console.error(
        `tracker/remind: goal ${r.goal_id} undelivered to ${r.telegram_id}` +
        `${permanent ? " (permanent — bot cannot message them)" : ""}: ${why}`,
      );
      if (permanent) blocked++;
    }

    return Response.json({ ok: true, due: due.length, sent, blocked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tracker/remind:", msg);
    return Response.json({ ok: false, error: "error" }, { status: 500 });
  }
}
