import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { TELEGRAM_ID } from "@/lib/auth";
import { tgSendMessage, tgSendChatAction, tgSendRichMessage, truncateForTelegram } from "@/lib/telegram";
import { buildSystemPrompt, runChat, type ChatTurn } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 120;

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number };
    text?: string;
    date: number;
  };
  edited_message?: TgUpdate["message"];
}

async function handleMessage(msg: NonNullable<TgUpdate["message"]>) {
  const fromId = String(msg.from?.id ?? "");
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  // Hard gate: only the configured Telegram ID may interact
  if (fromId !== TELEGRAM_ID) {
    await tgSendMessage(chatId, "Sorry — this is a private assistant.");
    return;
  }
  if (!text) return;

  // Built-in commands
  if (text.startsWith("/start")) {
    await tgSendMessage(
      chatId,
      "Привет, Камрон. Я твой персональный ассистент с полным доступом к дашборду — " +
      "расписание, задачи, бюджет, заявки на работу, древо знаний, методы (WOOP, цели, " +
      "обязательства), журнал. Могу не только отвечать, но и **менять** всё это: добавить " +
      "задачу, передвинуть блок в расписании, отметить привычку, обновить статус заявки и т.д.\n\n" +
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

  // Save user message
  await query(
    "INSERT INTO telegram_messages (telegram_id, chat_id, role, content, message_id) VALUES ($1, $2, 'user', $3, $4)",
    [fromId, chatId, text, msg.message_id],
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
    const result = await runChat(systemPrompt, history, text);
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
  if (msg && msg.text) {
    handleMessage(msg).catch(e => console.error("handleMessage error", e));
  }

  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ ok: true, route: "telegram-webhook" });
}
