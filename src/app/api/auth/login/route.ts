import { NextRequest, NextResponse } from "next/server";
import { setSession, DEFAULT_PASSWORD } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password === DEFAULT_PASSWORD) {
    await setSession({ authenticated: true, method: "password" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
}
