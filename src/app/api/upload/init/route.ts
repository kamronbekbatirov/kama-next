import { clientIp, rateLimit } from "@/lib/inbox";
import { createSession, type DeclaredFile } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Step 1 of the public upload flow: declare what's coming.
 *
 * Every file is vetted here — name, extension, size — BEFORE a single byte is
 * accepted, so a rejected type costs the server nothing. The response carries a
 * session id and a secret token that must accompany each subsequent chunk, so
 * one visitor can't write into another's in-flight upload.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // Separate bucket from the contact form so uploads can't exhaust its budget.
  if (!rateLimit(`upload:${ip}`, 10)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Honeypot — a bot that fills the hidden field gets a plausible-looking
  // session that leads nowhere.
  if (typeof body.website === "string" && body.website.trim()) {
    return Response.json({ error: "all_rejected", rejected: [] }, { status: 400 });
  }

  const declared = Array.isArray(body.files) ? (body.files as DeclaredFile[]) : [];
  const result = await createSession(ip, declared);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "store_full" ? 507 : 400 });
  }
  return Response.json(result.result);
}
