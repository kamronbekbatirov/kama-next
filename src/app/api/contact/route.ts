import { insertInboxMessage, clientIp, rateLimit } from "@/lib/inbox";
import { escapeHtml, tgNotifyOwner } from "@/lib/telegram";

const SITE = process.env.SITE_URL ?? "https://kama.uz";

/**
 * Public contact form on kama.uz. Submissions now land in the dashboard inbox
 * (`inbox_messages`) instead of being emailed via Resend — same-origin browser
 * POST, so it's protected by an IP rate-limit and a honeypot field.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let name = "", email = "", message = "", honeypot = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name : "";
    email = typeof body?.email === "string" ? body.email : "";
    message = typeof body?.message === "string" ? body.message : "";
    honeypot = typeof body?.website === "string" ? body.website.trim() : "";
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Honeypot: pretend success, store nothing.
  if (honeypot) return Response.json({ success: true });

  if (!name || !email || !message) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const result = await insertInboxMessage({
    source: "kama.uz",
    kind: "contact",
    name,
    email,
    subject: `Message from ${name}`,
    message,
    ip,
    user_agent: req.headers.get("user-agent"),
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  // Tell the owner at once. The inbox is a place you visit; a hire enquiry that
  // waits for the next visit is one you answer late. Best-effort — tgNotifyOwner
  // swallows its own failures, and a Telegram hiccup must not lose the message
  // that is already safely stored.
  void tgNotifyOwner(
    `<b>Заявка с kama.uz</b>\n` +
    `${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;\n\n` +
    escapeHtml(message.slice(0, 1500)),
    { reply_markup: { inline_keyboard: [[{ text: "Открыть инбокс", web_app: { url: `${SITE}/miniapp#inbox` } }]] } },
  ).catch(() => {});

  return Response.json({ success: true });
}
