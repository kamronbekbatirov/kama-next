import { insertInboxMessage } from "@/lib/inbox";
import { query } from "@/lib/db";
import { forwardInbound } from "@/lib/mail";

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/**
 * Svix (the delivery layer Resend webhooks use) signs
 * `${svix-id}.${svix-timestamp}.${raw body}` with the base64 secret that follows
 * the `whsec_` prefix, and sends one or more `v1,<sig>` pairs.
 */
async function svixValid(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  // Reject replays outside a 5-minute window.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));

  return sigHeader
    .split(" ")
    .map(part => part.split(",", 2))
    .some(([version, sig]) => version === "v1" && sig && timingSafeEqual(sig, mac));
}

/**
 * Resend inbound webhook. Emails to hi@kama.uz (and any domain whose MX points
 * at Resend) (1) land in the dashboard inbox and (2) are forwarded once to the
 * personal mailbox (INBOUND_FORWARD_TO). Forwarding also runs from the polling
 * sync (lib/inbox-sync), which is the reliable path since this webhook is not
 * always delivered. Both gate the forward on first ingest, so it fires once.
 *
 * Authentication is mandatory. Unauthenticated, this endpoint let anyone inject
 * arbitrary HTML into the dashboard inbox *and* make the owner's Resend account
 * forward it to INBOUND_FORWARD_TO. It fails closed: the polling sync still
 * ingests everything, so a rejected webhook costs latency, not mail.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  const svixSecret = process.env.RESEND_WEBHOOK_SECRET;
  const sharedSecret = process.env.INBOUND_WEBHOOK_SECRET;
  const provided =
    new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";

  const authed = svixSecret
    ? await svixValid(req, raw, svixSecret)
    : !!sharedSecret && timingSafeEqual(provided, sharedSecret);

  if (!authed) {
    if (!svixSecret && !sharedSecret) {
      console.error("[inbound] rejected: set RESEND_WEBHOOK_SECRET or INBOUND_WEBHOOK_SECRET");
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> & { data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Resend sends: { type: "email.received", data: { email_id, from, to, subject, text?, html?, ... } }
  const data: Record<string, unknown> = payload?.data ?? payload;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = data[k];
      if (typeof v === "string" && v) return v;
    }
    return "";
  };
  const emailId: string | undefined = pick("email_id") || undefined;
  const from: string = pick("from") || "unknown";
  const subject: string = pick("subject") || "(no subject)";

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
        // Forward a copy to the personal mailbox (once, on first ingest).
        await forwardInbound({ from, subject, html, text });
      }
    } catch (e) {
      console.error("[inbound] inbox insert failed", e);
    }
  }

  return Response.json({ ok: true });
}
