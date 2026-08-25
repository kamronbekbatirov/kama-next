import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSession, DEFAULT_PASSWORD } from "@/lib/auth";
import { ensureOwnerMember } from "@/lib/members";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const e = attempts.get(ip);
  if (!e || e.reset < now) {
    attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= MAX_ATTEMPTS) return false;
  e.count += 1;
  return true;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!rateLimit(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (constantTimeEqual(password, DEFAULT_PASSWORD)) {
    // The password grants OWNER scope and nothing else. Guests never get one —
    // they arrive through a single-use invite bound to their own member row.
    const owner = await ensureOwnerMember();
    if (!owner) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });

    await createSession({
      memberId: owner.id,
      role: "owner",
      method: "password",
      kind: "web",
      userAgent: req.headers.get("user-agent"),
      ip,
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
}
