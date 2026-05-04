import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { setSession, TELEGRAM_ID } from "@/lib/auth";

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
    if (!user || user.id !== TELEGRAM_ID) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
    }

    await setSession({ authenticated: true, method: "telegram", telegramId: user.id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
}
