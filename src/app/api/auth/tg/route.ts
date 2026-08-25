import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, TELEGRAM_ID } from "@/lib/auth";
import { ensureOwnerMember, getMemberByTelegramId } from "@/lib/members";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

function verifyInitData(initData: string): { id: string } | null {
  if (!BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  // Build the data-check string: sorted key=value pairs joined by \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // Secret key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (expectedHash !== hash) return null;

  // Reject stale data (older than 1 hour)
  const authDate = Number(params.get("auth_date") ?? "0");
  if (Date.now() / 1000 - authDate > 3600) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "{}");
    return { id: String(user.id) };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { init_data } = await req.json();
    if (!init_data) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
    }

    const user = verifyInitData(init_data);
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
    }

    // Telegram already proved who this is — initData is HMAC'd with the bot
    // token. The only question left is whether they are a member. The owner is
    // matched first so a fresh install still works before the id is backfilled.
    const member =
      user.id === TELEGRAM_ID
        ? await ensureOwnerMember()
        : await getMemberByTelegramId(user.id);

    if (!member) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    await createSession({
      memberId: member.id,
      role: member.role,
      method: "telegram",
      telegramId: user.id,
      kind: "telegram",
      userAgent: req.headers.get("user-agent"),
      ip,
    });
    return NextResponse.json({ ok: true, role: member.role });
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
}
