import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { TELEGRAM_ID } from "@/lib/auth";
import {
  tgSendMessage,
  tgSendChatAction,
  tgSendRichMessage,
  tgGetFileUrl,
  truncateForTelegram,
} from "@/lib/telegram";
import { transcribeAudio } from "@/lib/whisper";
import { buildSystemPrompt, runChat, type ChatTurn, type UserMessageInput } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 120;

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

// Telegram tops uploads at 20 MB for file_path downloads anyway, but we add a
// hard ceiling so a malformed update can't try to slurp something larger.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

interface TgFileObj { file_id: string; file_size?: number; mime_type?: string; file_name?: string; }
interface TgPhoto extends TgFileObj { width: number; height: number; }
interface TgVoice extends TgFileObj { duration: number; }
interface TgAudio extends TgFileObj { duration: number; }
interface TgDocument extends TgFileObj { thumbnail?: TgPhoto; }

interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number };
  text?: string;
  caption?: string;
  voice?: TgVoice;
  audio?: TgAudio;
  photo?: TgPhoto[];
  document?: TgDocument;
  date: number;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

interface Attachment {
  /** Pretty label for the saved-history row, e.g. "[voice 0:12]" */
  historyLabel: string;
  /** Claude content blocks to feed to runChat (image / document / text). */
  contentBlocks: Anthropic.ContentBlockParam[];
  /** Optional override: if the attachment is voice, the transcript becomes the user's "text". */
  transcribedText?: string;
}

async function downloadFile(fileId: string): Promise<Buffer | null> {
  const url = await tgGetFileUrl(fileId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) return null;
  return buf;
}

const IMAGE_MIME_BY_EXT: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function normaliseImageMime(mime: string | undefined, filename?: string): Anthropic.Base64ImageSource["media_type"] | null {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  if (mime && (allowed as readonly string[]).includes(mime)) {
    return mime as Anthropic.Base64ImageSource["media_type"];
  }
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (ext && IMAGE_MIME_BY_EXT[ext]) return IMAGE_MIME_BY_EXT[ext];
  return null;
}

/** Build Claude content blocks + a history label for a single attached media object. */
async function processAttachment(msg: TgMessage): Promise<Attachment | null> {
  // 1) Voice / audio → Whisper
  const voiceOrAudio = msg.voice ?? msg.audio;
  if (voiceOrAudio) {
    const buf = await downloadFile(voiceOrAudio.file_id);
    if (!buf) return null;
    const mime = voiceOrAudio.mime_type || "audio/ogg";
    // OGG/Opus is what Telegram voice notes use. Whisper accepts it directly.
    const ext = mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : "ogg";
    const tx = await transcribeAudio(buf, `audio.${ext}`, mime);
    const minutes = Math.floor(voiceOrAudio.duration / 60);
    const seconds = voiceOrAudio.duration % 60;
    const label = `[voice ${minutes}:${String(seconds).padStart(2, "0")}]`;
    if (!tx) {
      // Transcription failed — still acknowledge so user knows we got the message.
      return {
        historyLabel: `${label} (transcription failed)`,
        contentBlocks: [{ type: "text", text: `${label} The user sent a voice message, but Whisper transcription failed. Apologise briefly and ask them to retype.` }],
      };
    }
    return {
      historyLabel: `${label} ${tx.text}`,
      transcribedText: tx.text,
      contentBlocks: [{ type: "text", text: tx.text }],
    };
  }

  // 2) Photo → image content block (highest-resolution variant)
  if (msg.photo && msg.photo.length > 0) {
    // Telegram sends an array of PhotoSize from smallest to largest.
    const largest = msg.photo[msg.photo.length - 1];
    const buf = await downloadFile(largest.file_id);
    if (!buf) return null;
    // Telegram photos are JPEG.
    const blocks: Anthropic.ContentBlockParam[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: buf.toString("base64"),
        },
      },
    ];
    const caption = (msg.caption ?? "").trim();
    if (caption) {
      blocks.push({ type: "text", text: caption });
    } else {
      blocks.push({ type: "text", text: "Что на фото? Опиши коротко и подскажи если стоит что-то сделать в дашборде (например создать задачу или заявку)." });
    }
    return {
      historyLabel: `[photo${caption ? `: ${caption}` : ""}]`,
      contentBlocks: blocks,
    };
  }

  // 3) Document
  if (msg.document) {
    const doc = msg.document;
    const buf = await downloadFile(doc.file_id);
    if (!buf) return null;

    const caption = (msg.caption ?? "").trim();
    const nameForHistory = doc.file_name ?? "file";

    // 3a) PDF → Claude document block
    if (doc.mime_type === "application/pdf" || doc.file_name?.toLowerCase().endsWith(".pdf")) {
      const blocks: Anthropic.ContentBlockParam[] = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: buf.toString("base64"),
          },
        },
        { type: "text", text: caption || `Файл: ${nameForHistory}. Прочитай и расскажи что важно или что с ним сделать.` },
      ];
      return { historyLabel: `[pdf: ${nameForHistory}${caption ? ` — ${caption}` : ""}]`, contentBlocks: blocks };
    }

    // 3b) Image-as-document
    const asImage = normaliseImageMime(doc.mime_type, doc.file_name);
    if (asImage) {
      const blocks: Anthropic.ContentBlockParam[] = [
        {
          type: "image",
          source: { type: "base64", media_type: asImage, data: buf.toString("base64") },
        },
        { type: "text", text: caption || `Файл: ${nameForHistory}. Что на изображении?` },
      ];
      return { historyLabel: `[image: ${nameForHistory}${caption ? ` — ${caption}` : ""}]`, contentBlocks: blocks };
    }

    // 3c) Text-ish files → inline as text
    const looksTextual =
      doc.mime_type?.startsWith("text/") ||
      /\.(txt|md|csv|tsv|log|json|yaml|yml|sql|sh|py|js|ts|tsx|jsx|html|css)$/i.test(doc.file_name ?? "");
    if (looksTextual && buf.byteLength < 200_000) {
      const content = buf.toString("utf8");
      const blocks: Anthropic.ContentBlockParam[] = [
        {
          type: "text",
          text: `Пользователь прислал файл \`${nameForHistory}\`${caption ? ` с подписью: ${caption}` : ""}.\n\nСодержимое:\n\n\`\`\`\n${content.slice(0, 50_000)}\n\`\`\`${content.length > 50_000 ? "\n\n[Truncated]" : ""}`,
        },
      ];
      return { historyLabel: `[file: ${nameForHistory}${caption ? ` — ${caption}` : ""}]`, contentBlocks: blocks };
    }

    // 3d) Unsupported binary
    return {
      historyLabel: `[file: ${nameForHistory} (${doc.mime_type ?? "unknown"})]`,
      contentBlocks: [{
        type: "text",
        text: `Пользователь прислал файл "${nameForHistory}" (${doc.mime_type ?? "неизвестный тип"}, ${Math.round(buf.byteLength / 1024)} KB). Этот тип я пока не могу прочитать напрямую. Скажи об этом и предложи альтернативу (PDF, текст, картинку).`,
      }],
    };
  }

  return null;
}

async function handleMessage(msg: TgMessage) {
  const fromId = String(msg.from?.id ?? "");
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const caption = (msg.caption ?? "").trim();

  // Hard gate: only the configured Telegram ID may interact
  if (fromId !== TELEGRAM_ID) {
    await tgSendMessage(chatId, "Sorry — this is a private assistant.");
    return;
  }

  // Built-in commands (text only)
  if (text.startsWith("/start")) {
    await tgSendMessage(
      chatId,
      "Привет, Камрон. Я твой персональный ассистент с полным доступом к дашборду — " +
      "расписание, задачи, бюджет, заявки на работу, древо знаний, методы (WOOP, цели, " +
      "обязательства), журнал. Могу не только отвечать, но и **менять** всё это: добавить " +
      "задачу, передвинуть блок в расписании, отметить привычку, обновить статус заявки и т.д.\n\n" +
      "Шли голосовые — расшифрую через Whisper. Шли фото или PDF — пойму содержимое.\n\n" +
      "Команды:\n" +
      "/clear — очистить историю чата\n" +
      "/whoami — проверить что я тебя узнал",
    );
    return;
  }

  if (text.startsWith("/clear")) {
    await query("DELETE FROM telegram_messages WHERE telegram_id = $1", [fromId]);
    await tgSendMessage(chatId, "История очищена. Чистый лист.");
    return;
  }

  if (text.startsWith("/whoami")) {
    await tgSendMessage(chatId, `Telegram ID: ${fromId}\nУзнаю как Камрон. Доступ открыт.`);
    return;
  }

  // Decide what the user actually sent:
  // - text → plain string
  // - voice → transcript via Whisper, treated as text
  // - photo / pdf / file → multimodal content blocks
  let userInput: UserMessageInput;
  let historyText: string;

  const hasMedia = msg.voice || msg.audio || (msg.photo && msg.photo.length > 0) || msg.document;

  if (hasMedia) {
    // Different chat-action depending on media type so the user sees a hint
    // while we work.
    tgSendChatAction(chatId, msg.voice || msg.audio ? "typing" : "upload_photo").catch(() => {});
    const attachment = await processAttachment(msg);
    if (!attachment) {
      await tgSendMessage(chatId, "⚠️ Не удалось скачать вложение из Telegram (возможно, файл слишком большой — лимит 20 МБ).");
      return;
    }
    userInput = attachment.contentBlocks;
    historyText = attachment.historyLabel;
  } else if (text) {
    userInput = text;
    historyText = text;
  } else if (caption) {
    // Edge case: a message with just a caption and no recognised attachment type.
    userInput = caption;
    historyText = caption;
  } else {
    // Nothing actionable
    return;
  }

  // Save user turn in history (use the labelled version so it's readable)
  await query(
    "INSERT INTO telegram_messages (telegram_id, chat_id, role, content, message_id) VALUES ($1, $2, 'user', $3, $4)",
    [fromId, chatId, historyText, msg.message_id],
  );

  // Show typing indicator immediately and refresh every 4s while we work
  tgSendChatAction(chatId, "typing").catch(() => {});
  const typingInterval = setInterval(() => {
    tgSendChatAction(chatId, "typing").catch(() => {});
  }, 4000);

  // Load last 20 turns of conversation (excluding the just-inserted user msg)
  const histRows = await query<{ role: string; content: string }>(
    `SELECT role, content FROM telegram_messages
     WHERE telegram_id = $1 AND role IN ('user','assistant')
     ORDER BY created_at DESC LIMIT 20`,
    [fromId],
  );
  const allTurns = histRows.reverse();
  const history: ChatTurn[] = allTurns
    .slice(0, -1)
    .filter(r => r.role === "user" || r.role === "assistant")
    .map(r => ({ role: r.role as "user" | "assistant", content: r.content }));

  try {
    const systemPrompt = await buildSystemPrompt();
    const result = await runChat(systemPrompt, history, userInput);
    clearInterval(typingInterval);

    const finalText = truncateForTelegram(result.text || "(пустой ответ)");
    await tgSendRichMessage(chatId, finalText);

    // Save assistant message
    const summary = result.toolCalls.length > 0
      ? `${result.text}\n\n[Tools used: ${result.toolCalls.map(c => c.name).join(", ")}]`
      : result.text;
    await query(
      `INSERT INTO telegram_messages
        (telegram_id, chat_id, role, content, tokens_in, tokens_out, cache_read_tokens, cache_create_tokens)
       VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7)`,
      [fromId, chatId, summary,
       result.inputTokens, result.outputTokens, result.cacheReadTokens, result.cacheCreateTokens],
    );
  } catch (e) {
    clearInterval(typingInterval);
    console.error("runChat failed", e);
    const errMsg = e instanceof Error ? e.message : String(e);
    await tgSendMessage(chatId, `⚠️ Сбой при генерации ответа.\n${errMsg.slice(0, 300)}`).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) {
      return Response.json({ ok: false }, { status: 401 });
    }
  }

  const update = (await req.json()) as TgUpdate;
  const msg = update.message ?? update.edited_message;

  // Acknowledge fast; handle async (Telegram retries if we don't 200 quickly)
  if (msg && (msg.text || msg.caption || msg.voice || msg.audio || msg.photo || msg.document)) {
    handleMessage(msg).catch(e => console.error("handleMessage error", e));
  }

  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ ok: true, route: "telegram-webhook" });
}
