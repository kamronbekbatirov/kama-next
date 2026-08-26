import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "kama_session";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required (see .env.example)`);
  }
  return value;
}

const SECRET: string = requireEnv("SESSION_SECRET");

type Role = "owner" | "guest";

/** Decoded cookie claims. Routing hints only — never an authorization grant. */
interface Claims { valid: boolean; role: Role }

async function readClaims(token: string): Promise<Claims> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false, role: "guest" };
    const [encoded, sig] = parts;

    // Check payload structure first
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (decoded?.authenticated !== true) return { valid: false, role: "guest" };
    // Same 7-day server-side lifetime the session layer enforces — the cookie's
    // own maxAge is only a hint to the browser. Legacy tokens have no `iat`.
    if (typeof decoded.iat === "number" && Date.now() - decoded.iat > 7 * 24 * 60 * 60 * 1000) {
      return { valid: false, role: "guest" };
    }
    // A cookie minted before members existed carries no role and belongs to the
    // owner — the only person who could have had one.
    const role: Role = decoded.role === "guest" ? "guest" : "owner";

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
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(encoded));
    return { valid: ok, role };
  } catch {
    return { valid: false, role: "guest" };
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookie = req.cookies.get(SESSION_COOKIE);
  const claims = cookie ? await readClaims(cookie.value) : { valid: false, role: "guest" as const };

  // Structural backstop for the owner's private API. Every /api/dashboard route
  // also calls requireOwner() and re-reads the role from the database — this is
  // belt-and-braces, and it can only ever DOWNGRADE: a forged cookie claiming
  // "owner" still has to get past the database check behind it.
  if (pathname.startsWith("/api/dashboard")) {
    if (claims.valid && claims.role !== "owner") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Only protect /miniapp routes. /miniapp/join is public on purpose: it is
  // where an invite is redeemed, and the person arriving has no session yet by
  // definition — bouncing them to the password screen is exactly what an invite
  // is supposed to avoid.
  if (
    pathname.startsWith("/miniapp") &&
    !pathname.startsWith("/miniapp/login") &&
    !pathname.startsWith("/miniapp/join") &&
    !pathname.startsWith("/api/auth")
  ) {
    if (!claims.valid) {
      return NextResponse.redirect(new URL("/miniapp/login", req.url));
    }
    // Guests get exactly one page. Cookie-hint only — the page itself re-checks
    // the role against the database.
    if (
      claims.role === "guest" &&
      !pathname.startsWith("/miniapp/tracker") &&
      !pathname.startsWith("/miniapp/join")
    ) {
      return NextResponse.redirect(new URL("/miniapp/tracker", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/miniapp/:path*", "/api/dashboard/:path*"],
};
