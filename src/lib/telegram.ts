const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

interface TgSendMessageResp {
  ok: boolean;
  result?: { message_id: number; chat: { id: number } };
  description?: string;
}

export async function tgSendMessage(
  chatId: number | string,
  text: string,
  opts: { reply_to_message_id?: number; parse_mode?: "Markdown" | "MarkdownV2" | "HTML" } = {},
): Promise<TgSendMessageResp> {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...opts }),
  });
  return res.json();
}

export async function tgEditMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  opts: { parse_mode?: "Markdown" | "MarkdownV2" | "HTML" } = {},
): Promise<unknown> {
  const res = await fetch(`${API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, ...opts }),
  });
  return res.json();
}

/** Sends "typing" action; Telegram displays it for ~5s. Re-send for longer waits. */
export async function tgSendChatAction(
  chatId: number | string,
  action:
    | "typing"
    | "upload_photo"
    | "record_video"
    | "upload_video"
    | "record_voice"
    | "upload_voice"
    | "upload_document"
    | "find_location"
    | "record_video_note"
    | "upload_video_note" = "typing",
): Promise<unknown> {
  const res = await fetch(`${API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
  return res.json();
}

/**
 * Truncates text to Telegram's 4096-char limit. Try to cut at sentence boundary.
 */
export function truncateForTelegram(text: string, max = 4000): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastPeriod = head.lastIndexOf(". ");
  return (lastPeriod > max * 0.7 ? head.slice(0, lastPeriod + 1) : head) + "\n\n…";
}
