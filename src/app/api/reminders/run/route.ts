import { dueReminders, markFired } from "@/lib/reminders";
import { getTimezone } from "@/lib/timezone";
import { tgSendMessage } from "@/lib/telegram";
import { requireOwner, UNAUTHORIZED } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * Send reminders whose time has come. Driven by the same systemd timer as the
 * tracker nudges — one timer, two calls, no new runtime.
 *
 * Anyone reachable here started a conversation with the bot themselves, so
 * unlike the Mini App there is no write-permission question: a reminder can
 * only exist if they asked the bot for it.
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
    let sent = 0, blocked = 0;

    for (const r of due) {
      if (!r.telegram_id) continue;
      const res: { ok: boolean; description?: string } = await tgSendMessage(
        r.telegram_id, `🔔 ${r.text}`, { link_preview_options: { is_disabled: true } },
      ).catch(() => ({ ok: false, description: "request failed" }));

      // Stamped either way: a chat we cannot reach must not make the timer
      // retry the same nudge every few minutes for the rest of the day.
      await markFired(r.id, defaultTz);
      if (res.ok) { sent++; continue; }
      const why = res.description ?? "unknown";
      console.error(`reminders: #${r.id} undelivered to ${r.telegram_id}: ${why}`);
      if (/blocked|initiate|deactivated|chat not found/i.test(why)) blocked++;
    }

    return Response.json({ ok: true, due: due.length, sent, blocked });
  } catch (e) {
    console.error("reminders/run:", e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "error" }, { status: 500 });
  }
}
