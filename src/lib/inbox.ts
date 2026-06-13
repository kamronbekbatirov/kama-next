import { query } from "@/lib/db";

/**
 * Central inbox for every site's contact / feedback forms.
 *
 * Instead of paying for a Resend email per submission, the sites POST their
 * form straight into `inbox_messages` (this server's Postgres) and the kama.uz
 * dashboard reads them. Resend is kept for genuinely transactional mail only
 * (receipts, auth, inbound email forwarding).
 */

export type InboxKind = "contact" | "feedback" | "email";
export type InboxStatus = "new" | "read" | "archived";

export interface InboxMessage {
  id: number;
  source: string;
  kind: InboxKind;
  category: string | null;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  meta: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  status: InboxStatus;
  created_at: string;
  read_at: string | null;
}

export interface InboxInput {
  source: string;
  kind?: string;
  category?: string | null;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  message: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
  user_agent?: string | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** Result is either a validation error or the stored row. */
export type InsertResult =
  | { ok: true; message: InboxMessage }
  | { ok: false; error: string };

/**
 * Validate and persist one inbound message. Pure data layer — the caller is
 * responsible for rate-limiting and honeypot checks.
 */
export async function insertInboxMessage(input: InboxInput): Promise<InsertResult> {
  const message = clean(input.message, 5000);
  if (!message || message.length < 2) return { ok: false, error: "Message is required" };

  const source = clean(input.source, 80) ?? "unknown";
  const kind: InboxKind =
    input.kind === "feedback" || input.kind === "email" ? input.kind : "contact";
  const category = clean(input.category, 40);
  const name = clean(input.name, 200);
  const email = clean(input.email, 200);
  if (email && !EMAIL_RX.test(email)) return { ok: false, error: "Invalid email" };
  const subject = clean(input.subject, 300);
  const ip = clean(input.ip, 80);
  const user_agent = clean(input.user_agent, 400);
  const meta = input.meta && typeof input.meta === "object" ? input.meta : {};

  const rows = await query<InboxMessage>(
    `INSERT INTO inbox_messages
       (source, kind, category, name, email, subject, message, meta, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING id, source, kind, category, name, email, subject, message, meta,
               ip, user_agent, status, created_at, read_at`,
    [source, kind, category, name, email, subject, message, JSON.stringify(meta), ip, user_agent],
  );
  return { ok: true, message: rows[0] };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ─── In-memory IP rate limiter (per worker) ──────────────────────────────────
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(ip: string, max = MAX_PER_WINDOW): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || e.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= max) return false;
  e.count += 1;
  return true;
}
