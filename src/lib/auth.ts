import { cookies } from "next/headers";
import { createHmac, randomUUID } from "crypto";
import { query } from "@/lib/db";
import { emitRevoke } from "@/lib/session-events";

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

function verifyToken(token: string): SessionPayload | null {
  try {
    const [encoded, sig] = token.split(".");
    if (sign(encoded) !== sig) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return null;
  }
}

interface SessionPayload {
  authenticated: boolean;
  method?: string;
  telegramId?: string;
  sid?: string;
  iat?: number;
}

export interface SessionInfo {
  id: string;
  kind: string;
  method: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

async function writeCookie(payload: object) {
  const token = createToken({ ...payload, iat: Date.now() });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
}

async function readPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie) return null;
  return verifyToken(cookie.value);
}

/** Create a tracked session row and set the signed cookie carrying its id. */
export async function createSession(opts: {
  method: string;
  telegramId?: string;
  kind: "web" | "telegram";
  userAgent?: string | null;
  ip?: string | null;
}): Promise<string> {
  const sid = randomUUID();
  await query(
    `INSERT INTO sessions (id, kind, method, user_agent, ip) VALUES ($1, $2, $3, $4, $5)`,
    [sid, opts.kind, opts.method, opts.userAgent ?? null, opts.ip ?? null],
  );
  await writeCookie({ authenticated: true, method: opts.method, telegramId: opts.telegramId, sid });
  return sid;
}

export async function getSession(): Promise<SessionPayload | null> {
  const payload = await readPayload();
  if (!payload || payload.authenticated !== true) return null;

  // Tracked sessions must still exist and not be revoked. Legacy cookies (no
  // sid, issued before session tracking) stay valid and get migrated by
  // ensureTrackedSession on the next /api/auth/me call.
  if (payload.sid) {
    const rows = await query<{ revoked: boolean }>(
      "SELECT revoked FROM sessions WHERE id = $1",
      [payload.sid],
    );
    if (rows.length === 0 || rows[0].revoked) return null;
    // Throttled last-seen touch so we don't write on every single request.
    await query(
      "UPDATE sessions SET last_seen_at = NOW() WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '45 seconds'",
      [payload.sid],
    );
  }
  return payload;
}

/** Upgrade a legacy (sid-less) cookie into a tracked session, in place. */
export async function ensureTrackedSession(opts: { userAgent?: string | null; ip?: string | null }) {
  const payload = await readPayload();
  if (!payload || payload.authenticated !== true || payload.sid) return;
  await createSession({
    method: payload.method ?? "password",
    telegramId: payload.telegramId,
    kind: payload.method === "telegram" ? "telegram" : "web",
    userAgent: opts.userAgent,
    ip: opts.ip,
  });
}

export async function getCurrentSid(): Promise<string | null> {
  const payload = await readPayload();
  return payload?.sid ?? null;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const currentSid = await getCurrentSid();
  const rows = await query<Omit<SessionInfo, "current">>(
    `SELECT id, kind, method, user_agent, ip,
       to_char(created_at   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
     FROM sessions WHERE revoked = FALSE ORDER BY last_seen_at DESC`,
  );
  return rows.map(r => ({ ...r, current: r.id === currentSid }));
}

export async function revokeSession(id: string) {
  const rows = await query<{ id: string }>(
    "UPDATE sessions SET revoked = TRUE WHERE id = $1 AND revoked = FALSE RETURNING id",
    [id],
  );
  emitRevoke({ ids: rows.map(r => r.id) });
}

/** Revoke every active session except the caller's current one. */
export async function revokeOtherSessions() {
  const currentSid = await getCurrentSid();
  const rows = await query<{ id: string }>(
    "UPDATE sessions SET revoked = TRUE WHERE revoked = FALSE AND id <> $1 RETURNING id",
    [currentSid ?? ""],
  );
  emitRevoke({ ids: rows.map(r => r.id) });
}

/** Revoke every active session, including the caller's. */
export async function revokeAllSessions() {
  const rows = await query<{ id: string }>(
    "UPDATE sessions SET revoked = TRUE WHERE revoked = FALSE RETURNING id",
  );
  emitRevoke({ ids: rows.map(r => r.id) });
}

/** Sign out the current device: revoke its session row and drop the cookie. */
export async function clearSession() {
  const currentSid = await getCurrentSid();
  if (currentSid) await revokeSession(currentSid);
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Drop the cookie without touching the store (used after revoke-all). */
export async function dropCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
