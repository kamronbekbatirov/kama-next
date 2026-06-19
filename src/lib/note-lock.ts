import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { query } from "@/lib/db";

const SECRET = process.env.SESSION_SECRET ?? "";
const UNLOCK_COOKIE = "kama_notes_unlock";
const UNLOCK_TTL_MS = 15 * 60 * 1000; // unlocked window after a correct PIN
const PIN_SETTING_KEY = "note_pin";

function hmac(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

function hashPin(pin: string): string {
  return hmac(`note_pin:v1:${pin}`);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

async function getPinHash(): Promise<string | null> {
  const rows = await query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = $1",
    [PIN_SETTING_KEY],
  );
  const v = rows[0]?.value;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function pinIsSet(): Promise<boolean> {
  return (await getPinHash()) !== null;
}

async function storePinHash(hash: string) {
  await query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [PIN_SETTING_KEY, JSON.stringify(hash)],
  );
}

export async function setPin(pin: string) {
  await storePinHash(hashPin(pin));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await getPinHash();
  if (!stored) return false;
  return safeEqualHex(hashPin(pin), stored);
}

/** Remove the PIN entirely and unlock every note. */
export async function disableLock() {
  await query("DELETE FROM settings WHERE key = $1", [PIN_SETTING_KEY]);
  await query("UPDATE notes SET locked = FALSE WHERE locked = TRUE");
  await clearUnlock();
}

// ── unlock cookie (short-lived, set after a correct PIN) ─────────────────────
function signUnlock(exp: number): string {
  const encoded = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

export async function setUnlock() {
  const token = signUnlock(Date.now() + UNLOCK_TTL_MS);
  const store = await cookies();
  store.set(UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
    path: "/",
  });
}

export async function clearUnlock() {
  const store = await cookies();
  store.delete(UNLOCK_COOKIE);
}

export async function isUnlocked(): Promise<boolean> {
  const store = await cookies();
  const cookie = store.get(UNLOCK_COOKIE);
  if (!cookie) return false;
  const [encoded, sig] = cookie.value.split(".");
  if (!encoded || !sig || hmac(encoded) !== sig) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(encoded, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

// ── brute-force throttle (single-user dashboard, in-process) ─────────────────
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 6;
let attempts: { count: number; reset: number } = { count: 0, reset: 0 };

export function unlockRateLimited(): boolean {
  const now = Date.now();
  if (attempts.reset < now) attempts = { count: 0, reset: now + ATTEMPT_WINDOW_MS };
  return attempts.count >= MAX_ATTEMPTS;
}

export function noteFailedAttempt() {
  const now = Date.now();
  if (attempts.reset < now) attempts = { count: 0, reset: now + ATTEMPT_WINDOW_MS };
  attempts.count += 1;
}

export function resetAttempts() {
  attempts = { count: 0, reset: 0 };
}
