import { Resend } from "resend";
import { query } from "@/lib/db";

/**
 * Outbound mail for the dashboard (Tier 2: reply / compose from the inbox).
 * Sends via Resend from a verified sender and stores a copy in sent_messages
 * so the dashboard has a "Sent" view and per-message reply threads.
 */

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Verified Resend from-addresses, configurable via MAIL_SENDERS. */
export function mailSenders(): string[] {
  const raw = process.env.MAIL_SENDERS || process.env.MAIL_FROM || "hi@kama.uz";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  return list.length ? list : ["hi@kama.uz"];
}
export function defaultSender(): string {
  return mailSenders()[0];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

export interface SendInput {
  from?: string;
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  inReplyTo?: number | null;
}

export type SendResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Send an email and record it. A failed send is still stored (status='failed')
 * so it shows in the Sent list with its error, then returns ok:false.
 */
export async function sendAndStore(input: SendInput): Promise<SendResult> {
  const senders = mailSenders();
  const from = input.from && senders.includes(input.from) ? input.from : defaultSender();
  const to = (input.to || "").trim();
  if (!EMAIL_RX.test(to)) return { ok: false, error: "Invalid recipient address" };
  const subject = ((input.subject || "").trim() || "(no subject)").slice(0, 300);
  const body = (input.body || "").trim();
  if (!body) return { ok: false, error: "Message body is empty" };
  const inReplyTo = input.inReplyTo ?? null;

  const html = `<div style="white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">${escapeHtml(body)}</div>`;

  let resendId: string | null = null;
  let status: "sent" | "failed" = "sent";
  let error: string | null = null;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const r = await resend.emails.send({ from, to, subject, html, text: body });
    if (r.error) {
      status = "failed";
      error =
        typeof r.error === "object" && r.error && "message" in r.error
          ? String((r.error as { message?: unknown }).message ?? r.error)
          : String(r.error);
    } else {
      resendId = r.data?.id ?? null;
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  const rows = await query<{ id: number }>(
    `INSERT INTO sent_messages (in_reply_to, from_addr, to_email, to_name, subject, body, resend_id, status, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [inReplyTo, from, to, input.toName ?? null, subject, body, resendId, status, error],
  );

  if (status === "failed") return { ok: false, error: error ?? "Send failed" };
  return { ok: true, id: rows[0].id };
}
