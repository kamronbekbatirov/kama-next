import { insertInboxMessage, clientIp, rateLimit } from "@/lib/inbox";

/**
 * Server-to-server ingest for OTHER sites' forms (humanbase, …). Trusted
 * callers send the shared `X-Inbox-Key`; the kama.uz browser form uses its own
 * same-origin `/api/contact` route instead.
 *
 * The secret is required — every legitimate caller has it — so a leaked URL is
 * useless without the key. A second IP rate-limit guards against a leaked key.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOX_INGEST_SECRET;
  const provided = req.headers.get("x-inbox-key") ?? "";
  if (!secret || provided !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  if (!rateLimit(ip, 60)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Honeypot
  if (typeof body.website === "string" && body.website.trim()) {
    return Response.json({ ok: true });
  }

  const meta =
    body.meta && typeof body.meta === "object"
      ? (body.meta as Record<string, unknown>)
      : {};

  const result = await insertInboxMessage({
    source: typeof body.source === "string" ? body.source : "external",
    kind: typeof body.kind === "string" ? body.kind : "contact",
    category: typeof body.category === "string" ? body.category : null,
    name: typeof body.name === "string" ? body.name : null,
    email: typeof body.email === "string" ? body.email : null,
    subject: typeof body.subject === "string" ? body.subject : null,
    message: typeof body.message === "string" ? body.message : "",
    meta,
    ip,
    user_agent: req.headers.get("user-agent"),
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true, id: result.message.id });
}
