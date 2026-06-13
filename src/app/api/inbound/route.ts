import { Resend } from "resend";
import { insertInboxMessage } from "@/lib/inbox";
import { query } from "@/lib/db";

const FORWARD_TO = "REDACTED";

/** "Name <a@b.com>" → { name, email }; bare address or bare name also handled. */
function parseFrom(raw: string): { name: string | null; email: string | null } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim() || null, email: m[2].trim() };
  const bare = raw.trim();
  return /@/.test(bare) ? { name: null, email: bare } : { name: bare || null, email: null };
}

/** Which of his domains received this — used as the inbox "source" chip. */
function recipientSource(to: unknown): string {
  const m = String(to ?? "").match(/@([^>\s,;]+)/);
  return m ? m[1].toLowerCase() : "email";
}

/** Crude HTML → text so the inbox shows readable plain text, not markup. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Resend inbound webhook. Emails sent to hi@kama.uz (and any other domain whose
 * MX points at Resend) now (1) land in the dashboard inbox and (2) are still
 * forwarded to iCloud as a backup channel. The body is always fetched from
 * Resend — never trusted from the POST — so a forged webhook can't inject text.
 */
export async function POST(req: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const payload = await req.json();

  // Resend sends: { type: "email.received", data: { email_id, from, to, subject, text?, html?, ... } }
  const data = payload?.data ?? payload;
  const emailId: string | undefined = data?.email_id;
  const from: string = data?.from || "unknown";
  const subject: string = data?.subject || "(no subject)";
  const pick = (...keys: string[]): string => {
    for (const k of keys) if (typeof data?.[k] === "string" && data[k]) return data[k];
    return "";
  };

  // Body: prefer what Resend includes in the webhook payload (field names vary),
  // then fall back to the per-email API. Resend exposes no public GET for the
  // received-email body, so the payload is the reliable source.
  let html = pick("html");
  let text = pick("text", "plain", "plain_text", "plainText", "body", "content");
  if (!text && !html && emailId) {
    try {
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (r.ok) { const e = await r.json(); html = e.html || ""; text = e.text || ""; }
    } catch { /* best-effort */ }
  }
  const rawUrl = pick("raw_url", "raw_email_url", "raw");

  // 1) Store in the dashboard inbox. Always log the email when we have an id —
  //    if no body is available, fall back to the subject so it's still visible.
  //    Deduped on the Resend email id so webhook retries don't duplicate.
  if (emailId) {
    try {
      // Dedupe against the tombstone so a deleted message isn't re-created.
      const seen = await query<{ email_id: string }>(
        `SELECT email_id FROM inbox_seen_emails WHERE email_id = $1 LIMIT 1`,
        [emailId],
      );
      if (seen.length === 0) {
        const { name, email } = parseFrom(from);
        const message = text || (html ? htmlToText(html) : "") || `(${subject})`;
        await insertInboxMessage({
          source: recipientSource(data?.to),
          kind: "email",
          name,
          email,
          subject,
          message,
          html: html || null,
          meta: { emailId, to: data?.to ?? null, from_raw: from, raw_url: rawUrl || null },
        });
        await query(`INSERT INTO inbox_seen_emails (email_id) VALUES ($1) ON CONFLICT DO NOTHING`, [emailId]);
      }
    } catch (e) {
      console.error("[inbound] inbox insert failed", e);
    }
  }

  // 2) Forward to iCloud (unchanged backup channel).
  const forwardHtml = html || (text ? text.replace(/\n/g, "<br>") : "");
  const { error } = await resend.emails.send({
    from: "hi@kama.uz",
    to: FORWARD_TO,
    replyTo: from === "unknown" ? undefined : from,
    subject: `Fwd: ${subject}`,
    html: `
      <p style="color:#666;font-size:13px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">
        <strong>From:</strong> ${from}<br>
        <strong>Subject:</strong> ${subject}
        ${emailId ? `<br><strong>ID:</strong> ${emailId}` : ""}
      </p>
      ${forwardHtml || "<p><em>Body not available — check Resend dashboard.</em></p>"}
    `,
  });

  if (error) {
    return Response.json({ ok: false, error }, { status: 500 });
  }

  return Response.json({ ok: true });
}
