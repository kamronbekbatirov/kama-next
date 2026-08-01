const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/** The single account allowed to use the dashboard — and the only notify target. */
export const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_ID ?? "";

interface TgSendMessageResp {
  ok: boolean;
  result?: { message_id: number; chat: { id: number } };
  description?: string;
}

/** Inline keyboard, limited to the button kinds this app actually sends. */
export type TgInlineKeyboard = {
  inline_keyboard: { text: string; url?: string; web_app?: { url: string } }[][];
};

export async function tgSendMessage(
  chatId: number | string,
  text: string,
  opts: {
    reply_to_message_id?: number;
    parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
    reply_markup?: TgInlineKeyboard;
    disable_notification?: boolean;
    link_preview_options?: { is_disabled?: boolean };
    signal?: AbortSignal;
  } = {},
): Promise<TgSendMessageResp> {
  const { signal, ...body } = opts;
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...body }),
    signal,
  });
  return res.json();
}

/** Escape the four characters Telegram's HTML parse mode cares about. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Ping the owner's private chat. Best-effort by design: a notification is never
 * worth failing (or delaying) the request that triggered it, so this swallows
 * every error and gives up after a few seconds.
 */
export async function tgNotifyOwner(
  html: string,
  opts: { reply_markup?: TgInlineKeyboard; timeoutMs?: number } = {},
): Promise<boolean> {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) return false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await tgSendMessage(OWNER_CHAT_ID, truncateForTelegram(html), {
      parse_mode: "HTML",
      reply_markup: opts.reply_markup,
      link_preview_options: { is_disabled: true },
      signal: ac.signal,
    });
    if (!res.ok) console.error("tgNotifyOwner:", res.description);
    return !!res.ok;
  } catch (e) {
    console.error("tgNotifyOwner:", e instanceof Error ? e.message : String(e));
    return false;
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Resolve a Telegram file_id to a downloadable URL.
 * Telegram caps direct downloads at 20 MB per file.
 */
export async function tgGetFileUrl(fileId: string): Promise<string | null> {
  const res = await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const body = await res.json();
  if (!body?.ok || !body.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${body.result.file_path}`;
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

/**
 * Convert a Claude-style Markdown snippet to the subset of HTML that
 * Telegram's `parse_mode: "HTML"` accepts. Telegram only honours a small
 * tag set (<b>, <i>, <u>, <s>, <code>, <pre>, <a>, <blockquote>); other
 * markup is shown as plain text. We render the common things Claude emits
 * (bold, italic, code, links, simple headings) and leave the rest alone.
 *
 * Robustness over fidelity: if a regex misses, the text just shows the raw
 * markdown — never a hard send failure.
 */
export function mdToTelegramHtml(md: string): string {
  const PRE = "__PREMARKER__";
  const CODE = "__CODEMARKER__";
  const preBlocks: string[] = [];
  const codeBlocks: string[] = [];

  // 1. Pull out ```fenced code``` first (preserves contents byte-for-byte).
  let out = md.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, (_, code) => {
    const idx = preBlocks.length;
    preBlocks.push(code);
    return `${PRE}${idx}${PRE}`;
  });

  // 2. Pull out `inline code` next.
  out = out.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code);
    return `${CODE}${idx}${CODE}`;
  });

  // 3. Escape HTML-special chars in everything that's left.
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  out = escape(out);

  // 4. Headings: `# Title`, `## Title`, etc. -> bold line.
  out = out.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // 5. Bold / italic / strike. **bold** and __bold__ -> <b>, *italic* / _italic_ -> <i>.
  out = out
    .replace(/\*\*([^\n*]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^\n_]+?)__/g, "<b>$1</b>")
    .replace(/(?<![*\w])\*(?!\s)([^\n*]+?)(?<!\s)\*(?![*\w])/g, "<i>$1</i>")
    .replace(/(?<![_\w])_(?!\s)([^\n_]+?)(?<!\s)_(?![_\w])/g, "<i>$1</i>")
    .replace(/~~([^\n~]+?)~~/g, "<s>$1</s>");

  // 6. Markdown links: [text](url). text was already escaped above.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    return `<a href="${url}">${text}</a>`;
  });

  // 7. Restore code blocks with their contents HTML-escaped.
  out = out.replace(
    new RegExp(`${PRE}(\\d+)${PRE}`, "g"),
    (_, i) => `<pre>${escape(preBlocks[Number(i)])}</pre>`,
  );
  out = out.replace(
    new RegExp(`${CODE}(\\d+)${CODE}`, "g"),
    (_, i) => `<code>${escape(codeBlocks[Number(i)])}</code>`,
  );

  return out;
}

/** Strip all Markdown decoration -- used as the safe fallback. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^\n*]+?)\*\*/g, "$1")
    .replace(/__([^\n_]+?)__/g, "$1")
    .replace(/(?<![*\w])\*(?!\s)([^\n*]+?)(?<!\s)\*(?![*\w])/g, "$1")
    .replace(/(?<![_\w])_(?!\s)([^\n_]+?)(?<!\s)_(?![_\w])/g, "$1")
    .replace(/~~([^\n~]+?)~~/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
}

/**
 * Send a Claude-authored message via Telegram, rendering Markdown as HTML.
 * If Telegram rejects the formatted version (bad tag balance, etc.), retry
 * once with the markdown stripped so the user always gets something.
 */
export async function tgSendRichMessage(
  chatId: number | string,
  markdown: string,
): Promise<TgSendMessageResp> {
  const html = mdToTelegramHtml(markdown);
  const first = await tgSendMessage(chatId, html, { parse_mode: "HTML" });
  if (first.ok) return first;
  return tgSendMessage(chatId, stripMarkdown(markdown));
}
