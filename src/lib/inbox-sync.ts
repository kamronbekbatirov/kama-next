import { query } from "@/lib/db";
import { insertInboxMessage } from "@/lib/inbox";

/**
 * Pull received emails from Resend into the dashboard inbox.
 *
 * Resend's inbound webhook (email.received) has proven unreliable here, but the
 * REST API works: `GET /emails/receiving` lists received mail (metadata) and
 * `GET /emails/receiving/{id}` returns the body. We poll the list, dedupe on
 * the Resend email id, fetch the body for new ones, and insert. 30-day
 * retention on Resend's side, so the list stays small.
 */

const API = "https://api.resend.com";

function parseAddr(raw: string): { name: string | null; email: string | null } {
  const m = (raw || "").match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim() || null, email: m[2].trim() };
  const b = (raw || "").trim();
  return /@/.test(b) ? { name: null, email: b } : { name: b || null, email: null };
}

function recipientDomain(to: unknown): string {
  const s = Array.isArray(to) ? String(to[0] ?? "") : String(to ?? "");
  const m = s.match(/@([^>\s,;]+)/);
  return m ? m[1].toLowerCase() : "email";
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ReceivedMeta {
  id: string;
  from?: string;
  to?: unknown;
  subject?: string;
  message_id?: string;
  created_at?: string;
}

export async function syncReceivedEmails(limit = 40): Promise<{ synced: number; checked: number }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { synced: 0, checked: 0 };
  const headers = { Authorization: `Bearer ${key}` };

  const listRes = await fetch(`${API}/emails/receiving?limit=${limit}`, { headers, cache: "no-store" });
  if (!listRes.ok) return { synced: 0, checked: 0 };
  const list = await listRes.json();
  const items: ReceivedMeta[] = Array.isArray(list?.data) ? list.data : [];
  if (!items.length) return { synced: 0, checked: 0 };

  // Dedupe against the tombstone, not live rows — so a deleted message is NOT
  // re-pulled on the next sync.
  const ids = items.map((i) => i.id);
  const existing = await query<{ eid: string }>(
    `SELECT email_id AS eid FROM inbox_seen_emails WHERE email_id = ANY($1)`,
    [ids],
  );
  const have = new Set(existing.map((r) => r.eid));

  let synced = 0;
  for (const it of items) {
    if (have.has(it.id)) continue;
    let html = "", text = "";
    try {
      const r = await fetch(`${API}/emails/receiving/${it.id}`, { headers, cache: "no-store" });
      if (r.ok) { const e = await r.json(); html = e.html || ""; text = e.text || ""; }
    } catch { /* body fetch best-effort */ }

    const { name, email } = parseAddr(it.from || "");
    const subject = it.subject || "(no subject)";
    const message = text || (html ? htmlToText(html) : "") || `(${subject})`;

    const res = await insertInboxMessage({
      source: recipientDomain(it.to),
      kind: "email",
      name,
      email,
      subject,
      message,
      html: html || null,
      meta: { emailId: it.id, to: it.to ?? null, from_raw: it.from ?? null, message_id: it.message_id ?? null },
    });
    if (res.ok) synced++;
    // Record as seen even if insert failed, so we don't retry it forever.
    await query(`INSERT INTO inbox_seen_emails (email_id) VALUES ($1) ON CONFLICT DO NOTHING`, [it.id]);
  }
  return { synced, checked: items.length };
}
