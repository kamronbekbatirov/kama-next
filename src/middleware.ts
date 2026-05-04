import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "kama_session";
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET environment variable is required (see .env.example)");
}

async function hasValidToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [encoded, sig] = parts;

    // Check payload structure first
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (decoded?.authenticated !== true) return false;

    // Verify HMAC signature using Web Crypto API (Edge-runtime compatible)
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = Buffer.from(sig, "hex");
    return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(encoded));
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /miniapp routes (not /miniapp/login or API auth routes)
  if (
    pathname.startsWith("/miniapp") &&
    !pathname.startsWith("/miniapp/login") &&
    !pathname.startsWith("/api/auth")
  ) {
    const cookie = req.cookies.get(SESSION_COOKIE);
    if (!cookie || !(await hasValidToken(cookie.value))) {
      return NextResponse.redirect(new URL("/miniapp/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/miniapp/:path*"],
};
