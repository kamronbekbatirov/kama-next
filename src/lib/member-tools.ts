import type Anthropic from "@anthropic-ai/sdk";
import { listMembers, upsertGuest, createInvite, refreshMemberPhoto, OWNER_MEMBER_ID } from "@/lib/members";
import { revokeMember } from "@/lib/auth";
import { tgBotUsername, tgSendMessage } from "@/lib/telegram";

const SITE = process.env.SITE_URL ?? "https://kama.uz";

/**
 * Owner-only tools for the tracker's guest list.
 *
 * These are never reachable by a guest: they are appended to the owner's tool
 * list and dispatched by the owner's branch only, and the guest module has no
 * fallthrough that could reach them.
 */
export const MEMBER_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_members",
    description: "Everyone with access to the shared tracker. Revoked people are not listed.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "invite_member",
    description:
      "Invite someone to the shared tracker and get a one-time link back. Their Telegram id is optional and usually unknown — pressing Start on the link is what supplies it. If an id is given, the bot also sends them the invite directly.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "What the owner wants to call this person." },
        telegram_id: { type: "string", description: "Optional, only if the owner already knows it." },
      },
      required: ["name"],
    },
  },
  {
    name: "revoke_member",
    description:
      "Remove someone's access to the shared tracker. They are signed out at once and disappear from the list and the board. Only do this when the owner asks for that person by name.",
    input_schema: {
      type: "object",
      properties: { member_id: { type: "string" } },
      required: ["member_id"],
    },
  },
];

type Input = Record<string, unknown>;
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export async function executeMemberTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case "list_members": {
      const rows = await listMembers();
      return rows
        .map(m => `${m.id} — ${m.display_name} (${m.role}${m.telegram_id ? "" : ", not connected yet"})`)
        .join("\n");
    }

    case "invite_member": {
      const display = asStr(input.name);
      if (!display) return "Error: name required";
      const telegramId = asStr(input.telegram_id);
      const member = await upsertGuest({
        telegramId, displayName: display, invitedBy: OWNER_MEMBER_ID,
      });
      const token = await createInvite(member.id, OWNER_MEMBER_ID);
      void refreshMemberPhoto(member.id, telegramId, true).catch(() => {});

      const bot = await tgBotUsername();
      const link = bot
        ? `https://t.me/${bot}?start=${token}`
        : `${SITE}/miniapp/join?t=${token}`;

      let delivered = false;
      if (telegramId) {
        const res = await tgSendMessage(
          telegramId,
          "Тебя пригласили в общий трекер целей.\n\n" +
          "Нажми кнопку ниже — откроется трекер. Приглашение одноразовое и живёт 72 часа.",
          {
            link_preview_options: { is_disabled: true },
            reply_markup: {
              inline_keyboard: [[{ text: "Открыть трекер", web_app: { url: `${SITE}/miniapp/join?t=${token}` } }]],
            },
          },
        ).catch(() => ({ ok: false }));
        delivered = !!res.ok;
      }
      return `Invited ${display}. Link (one-time, 72h): ${link}` +
        (telegramId ? (delivered ? " — also sent to them directly." : " — could not message them; pass the link on.") : "");
    }

    case "revoke_member": {
      const id = asStr(input.member_id);
      if (!id) return "Error: member_id required";
      if (id === OWNER_MEMBER_ID) return "Error: the owner cannot be revoked.";
      await revokeMember(id);
      return "Access revoked. They are signed out and gone from the list.";
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}

export const MEMBER_TOOL_NAMES = new Set(MEMBER_TOOL_DEFINITIONS.map(t => t.name));
