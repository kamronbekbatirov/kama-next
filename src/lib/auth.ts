import { cookies } from "next/headers";
import { createHmac } from "crypto";

const SESSION_COOKIE = "kama_session";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required (see .env.example)`);
  }
  return value;
}

const SECRET: string = requireEnv("SESSION_SECRET");

export const TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID ?? "";

export const DEFAULT_PASSWORD: string = requireEnv("DASHBOARD_PASSWORD");

function sign(value: string): string {
  const hmac = createHmac("sha256", SECRET);
  hmac.update(value);
  return hmac.digest("hex");
}

function createToken(payload: object): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64url");
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): object | null {
  try {
    const [encoded, sig] = token.split(".");
    if (sign(encoded) !== sig) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return null;
  }
}

export async function setSession(data: object) {
  const token = createToken({ ...data, iat: Date.now() });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
}

export async function getSession(): Promise<{ authenticated: boolean; method?: string } | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie) return null;
  const payload = verifyToken(cookie.value);
  if (!payload) return null;
  return payload as { authenticated: boolean; method?: string };
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
