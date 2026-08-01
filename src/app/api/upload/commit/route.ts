import { query } from "@/lib/db";
import { clientIp, insertInboxMessage } from "@/lib/inbox";
import { finalizeSession, recordQuota, type Rejection, type StoredFile } from "@/lib/uploads";
import { escapeHtml, tgNotifyOwner } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Trim a free-text field to a sane length, or null if it's blank. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

/** Where the notification button drops you: the inbox pane of the mini app. */
const MINIAPP_INBOX_URL = "https://kama.uz/miniapp#server/inbox";

/**
 * Tell the owner a drop just landed. Best-effort — `tgNotifyOwner` swallows its
 * own errors, so a Telegram outage can never fail an upload that already
 * succeeded. Every interpolated value is escaped: filenames and the note come
 * from a stranger.
 */
async function notifyOwner(d: {
  name: string | null;
  contact: string | null;
  note: string | null;
  stored: StoredFile[];
  rejected: Rejection[];
  total: number;
}) {
  const who = d.name ?? "Anonymous";
  const lines = [
    `📥 <b>${escapeHtml(who)}</b> sent ${d.stored.length} file${d.stored.length === 1 ? "" : "s"} · ${humanSize(d.total)}`,
  ];
  if (d.contact) lines.push(`✉️ ${escapeHtml(d.contact)}`);
  if (d.note) lines.push("", `<blockquote>${escapeHtml(d.note)}</blockquote>`);
  lines.push(
    "",
    ...d.stored.slice(0, 12).map((f) => `• ${escapeHtml(f.filename)} <i>(${humanSize(f.size)})</i>`),
  );
  if (d.stored.length > 12) lines.push(`… +${d.stored.length - 12}`);
  if (d.rejected.length) lines.push("", `⚠️ ${d.rejected.length} refused by the file checks`);

  await tgNotifyOwner(lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [[{ text: "Open inbox", web_app: { url: MINIAPP_INBOX_URL } }]],
    },
  });
}

/**
 * Step 3: verify the finished bytes and file the submission.
 *
 * Each completed file is re-checked against its format's magic bytes here (the
 * last gate before anything is kept), then moved into the store under an opaque
 * key. The submission lands in the same dashboard inbox as the contact forms,
 * as kind 'upload', with one `inbox_attachments` row per accepted file.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (!sessionId || !token) return Response.json({ error: "bad_request" }, { status: 400 });

  const result = await finalizeSession(sessionId, token);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "unknown_session" ? 403 : 400 });
  }

  const name = text(body.name, 200);
  const note = text(body.note, 2000);
  const contact = text(body.contact, 200);

  const total = result.stored.reduce((n, f) => n + f.size, 0);
  const summary = `${result.stored.length} file${result.stored.length === 1 ? "" : "s"} · ${humanSize(total)}`;
  // The dashboard renders the files themselves as a gallery, so the body is the
  // sender's own words — falling back to the summary when they wrote nothing.
  // The manifest lives in meta as the durable record if the files are deleted.
  const messageBody = note ?? summary;

  const inserted = await insertInboxMessage({
    source: "kama.uz/upload",
    kind: "upload",
    name,
    // Only store a contact string that looks like an email — the inbox reply
    // flow treats `email` as replyable.
    email: contact && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact) ? contact : null,
    subject: summary,
    message: messageBody,
    meta: {
      contact: contact ?? undefined,
      files: result.stored.length,
      bytes: total,
      manifest: result.stored.map((f) => ({ name: f.filename, size: f.size, sha256: f.sha256 })),
      rejected: result.rejected.length ? result.rejected : undefined,
    },
    ip,
    user_agent: req.headers.get("user-agent"),
  });

  if (!inserted.ok) return Response.json({ error: inserted.error }, { status: 400 });

  for (const f of result.stored) {
    await query(
      `INSERT INTO inbox_attachments (message_id, filename, storage_key, mime, size_bytes, sha256)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [inserted.message.id, f.filename, f.storageKey, f.mime, f.size, f.sha256],
    );
  }
  await recordQuota(ip, result.stored);
  await notifyOwner({ name, contact, note, stored: result.stored, rejected: result.rejected, total });

  return Response.json({
    ok: true,
    stored: result.stored.map((f) => ({ filename: f.filename, size: f.size })),
    rejected: result.rejected,
  });
}
