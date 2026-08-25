import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { redeemInvite } from "@/lib/members";
import { clientIp, rateLimit } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/**
 * Redeem a single-use invite and start a session.
 *
 * No password is involved, and none is needed: the token is 256 bits of
 * CSPRNG, stored hashed, usable once, expiring in 72 hours, and delivered over
 * an authenticated Telegram channel. It grants exactly the role stored on the
 * member row — never owner scope, because role is re-read from the database on
 * every subsequent request.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`invite:${ip}`, 10)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const member = await redeemInvite(token, ip);
  if (!member) {
    return NextResponse.json({ ok: false, error: "invalid_or_used" }, { status: 403 });
  }

  await createSession({
    memberId: member.id,
    role: member.role,
    method: "invite",
    telegramId: member.telegram_id ?? undefined,
    kind: "web",
    userAgent: req.headers.get("user-agent"),
    ip,
  });
  return NextResponse.json({ ok: true, role: member.role, name: member.display_name });
}
