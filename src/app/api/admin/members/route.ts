import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { revokeMember, TELEGRAM_ID } from "@/lib/auth";
import { listMembers, upsertGuest, createInvite, getMemberById } from "@/lib/members";
import { tgSendMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const SITE = process.env.SITE_URL ?? "https://kama.uz";

/** Owner-only: who has access to the shared tracker. */
export async function GET() {
  try {
    await requireOwner();
    return Response.json(await listMembers());
  } catch {
    return UNAUTHORIZED();
  }
}

/**
 * Invite someone. Creates (or re-activates) the member and mints a single-use
 * link, which the bot delivers to them directly.
 */
export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const b = await req.json();
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const telegramId = typeof b.telegram_id === "string" ? b.telegram_id.trim() : "";
    if (!name) return Response.json({ error: "name required" }, { status: 400 });

    // Rail: the owner is not invitable, and cannot be shadowed by a guest row
    // carrying the same Telegram id.
    if (telegramId && telegramId === TELEGRAM_ID) {
      return Response.json({ error: "that is the owner's Telegram id" }, { status: 400 });
    }

    const member = await upsertGuest({ telegramId, displayName: name, invitedBy: owner.memberId });
    const token = await createInvite(member.id, owner.memberId);
    const url = `${SITE}/miniapp/join?t=${token}`;

    // Best effort: a guest who has never pressed /start cannot receive a bot
    // message, so hand the URL back for the owner to pass along.
    let delivered = false;
    if (telegramId) {
      // A `web_app` inline button opens the Mini App natively — inside Telegram
      // a bare https link goes to the in-app browser instead, which is a
      // separate webview with no initData, no theme sync and its own cookie
      // jar. The token rides in the button rather than the message body so a
      // forwarded message does not carry it.
      const res = await tgSendMessage(
        telegramId,
        "Тебя пригласили в общий трекер целей.\n\n" +
        "Нажми кнопку ниже — откроется трекер. Приглашение одноразовое и живёт 72 часа.",
        {
          link_preview_options: { is_disabled: true },
          reply_markup: { inline_keyboard: [[{ text: "Открыть трекер", web_app: { url } }]] },
        },
      ).catch(() => ({ ok: false }));
      delivered = !!res.ok;
    }

    return Response.json({ ok: true, member, url, delivered });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("admin/members POST:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}

/** Revoke a guest: their sessions die on the next request, bot access too. */
export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const { id } = await req.json();
    if (typeof id !== "string" || !id) return Response.json({ error: "id required" }, { status: 400 });

    const target = await getMemberById(id);
    if (target?.role === "owner") {
      return Response.json({ error: "cannot revoke the owner" }, { status: 400 });
    }
    await revokeMember(id);
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "unauthorized") return UNAUTHORIZED();
    console.error("admin/members DELETE:", msg);
    return Response.json({ error: "error" }, { status: 500 });
  }
}
