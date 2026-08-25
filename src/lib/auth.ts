import { cookies } from "next/headers";
import { createHmac, randomUUID } from "crypto";
import { query } from "@/lib/db";
import { emitRevoke } from "@/lib/session-events";
import { touchMemberSeen, type MemberRole } from "@/lib/members";

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

// Cookies are handed out with `maxAge: 7 days`, but that is only a hint the
// browser may honour — the token itself carried no expiry, so a copied cookie
// stayed valid forever. Enforce the same lifetime server-side.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function verifyToken(token: string): SessionPayload | null {
  try {
    const [encoded, sig] = token.split(".");
    if (sign(encoded) !== sig) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    // Legacy cookies predate `iat` and have a tracked `sid` instead — those are
    // revocable from the sessions list, so they stay valid.
    if (typeof payload.iat === "number" && Date.now() - payload.iat > SESSION_MAX_AGE_MS) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * What the signed cookie carries. `role` and `mid` are ROUTING HINTS ONLY —
 * Edge middleware can read them without a database round trip, but Node code
 * must never grant on them. A cookie lives 7 days and cannot be recalled; the
 * `members` row can. Authorization always re-reads the database.
 */
interface SessionPayload {
  authenticated: boolean;
  method?: string;
  telegramId?: string;
  sid?: string;
  iat?: number;
  role?: MemberRole;
  mid?: string;
}

/**
 * A resolved session: who is calling, verified against the database.
 *
 * Deliberately has no `authenticated` field. Every route used to ask
 * `if (!s?.authenticated)`, which answered "is somebody logged in" — the wrong
 * question once there is more than one person. Dropping the field turns every
 * one of those call sites into a compile error, so none can be forgotten.
 */
export interface Session {
  sid: string;
  memberId: string;
  role: MemberRole;
  telegramId: string | null;
  method: string | null;
  displayName: string;
  tz: string | null;
  lang: "en" | "ru" | "uz" | null;
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
  memberId: string;
  role: MemberRole;
  method: string;
  telegramId?: string;
  kind: "web" | "telegram";
  userAgent?: string | null;
  ip?: string | null;
}): Promise<string> {
  const sid = randomUUID();
  await query(
    `INSERT INTO sessions (id, kind, method, user_agent, ip, member_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [sid, opts.kind, opts.method, opts.userAgent ?? null, opts.ip ?? null, opts.memberId],
  );
  await writeCookie({
    authenticated: true,
    method: opts.method,
    telegramId: opts.telegramId,
    sid,
    role: opts.role,
    mid: opts.memberId,
  });
  return sid;
}

/**
 * Resolve the caller from the cookie, verified against the database.
 *
 * One JOIN replaces the old two-step check. Revoking a MEMBER now kills every
 * session they hold without touching the `sessions` table — that is the
 * property that makes revocation trustworthy, since the cookie itself cannot
 * be recalled before it expires.
 *
 * Only `@/lib/guard` should call this. Everything else goes through
 * `requireOwner()` / `requireMember()` so that choosing an audience is
 * unavoidable.
 */
export async function resolveSession(): Promise<Session | null> {
  const payload = await readPayload();
  if (!payload || payload.authenticated !== true || !payload.sid) return null;

  const rows = await query<{
    sid: string; method: string | null; member_id: string; role: MemberRole;
    telegram_id: string | null; display_name: string;
    tz: string | null; lang: "en" | "ru" | "uz" | null;
  }>(
    `SELECT s.id AS sid, s.method, m.id AS member_id, m.role, m.telegram_id,
            m.display_name, m.tz, m.lang
       FROM sessions s
       JOIN members m ON m.id = s.member_id
      WHERE s.id = $1 AND s.revoked = FALSE AND m.revoked_at IS NULL`,
    [payload.sid],
  );
  const row = rows[0];
  if (!row) return null;

  // Throttled last-seen touches so we don't write on every single request.
  await query(
    "UPDATE sessions SET last_seen_at = NOW() WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '45 seconds'",
    [row.sid],
  );
  await touchMemberSeen(row.member_id);

  return {
    sid: row.sid,
    memberId: row.member_id,
    role: row.role,
    telegramId: row.telegram_id,
    method: row.method,
    displayName: row.display_name,
    tz: row.tz,
    lang: row.lang,
  };
}

export async function getCurrentSid(): Promise<string | null> {
  const payload = await readPayload();
  return payload?.sid ?? null;
}

/**
 * Sessions belonging to ONE member.
 *
 * This used to return every active session to any authenticated caller, and
 * `revokeSession` used to revoke any id it was handed. Harmless while there was
 * exactly one person; the moment a guest exists it lets them enumerate the
 * owner's devices and sign them all out. Every function below is scoped.
 */
export async function listSessions(memberId: string): Promise<SessionInfo[]> {
  const currentSid = await getCurrentSid();
  const rows = await query<Omit<SessionInfo, "current">>(
    `SELECT id, kind, method, user_agent, ip,
       to_char(created_at   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
     FROM sessions WHERE revoked = FALSE AND member_id = $1 ORDER BY last_seen_at DESC`,
    [memberId],
  );
  return rows.map(r => ({ ...r, current: r.id === currentSid }));
}

/** Revoke one session — only if it belongs to `memberId`. */
export async function revokeSession(id: string, memberId: string) {
  const rows = await query<{ id: string }>(
    "UPDATE sessions SET revoked = TRUE WHERE id = $1 AND member_id = $2 AND revoked = FALSE RETURNING id",
    [id, memberId],
  );
  emitRevoke({ ids: rows.map(r => r.id) });
  return rows.length > 0;
}

/** Revoke this member's other sessions, keeping the caller signed in. */
export async function revokeOtherSessions(memberId: string) {
  const currentSid = await getCurrentSid();
  const rows = await query<{ id: string }>(
    "UPDATE sessions SET revoked = TRUE WHERE revoked = FALSE AND member_id = $2 AND id <> $1 RETURNING id",
    [currentSid ?? "", memberId],
  );
  emitRevoke({ ids: rows.map(r => r.id) });
}

/** Revoke every session this member holds, including the caller's. */
export async function revokeAllSessions(memberId: string) {
  const rows = await query<{ id: string }>(
    "UPDATE sessions SET revoked = TRUE WHERE revoked = FALSE AND member_id = $1 RETURNING id",
    [memberId],
  );
  emitRevoke({ ids: rows.map(r => r.id) });
}

/** Revoke a member and every session they hold, in one call. */
export async function revokeMember(memberId: string) {
  await query("UPDATE members SET revoked_at = NOW() WHERE id = $1 AND role <> 'owner'", [memberId]);
  await query("DELETE FROM member_invites WHERE member_id = $1 AND used_at IS NULL", [memberId]);
  await revokeAllSessions(memberId);
}

/** Sign out the current device: revoke its session row and drop the cookie. */
export async function clearSession() {
  const currentSid = await getCurrentSid();
  if (currentSid) {
    // Signing yourself out needs no ownership check — the sid came from your
    // own cookie — so this bypasses the member-scoped helper deliberately.
    const rows = await query<{ id: string }>(
      "UPDATE sessions SET revoked = TRUE WHERE id = $1 AND revoked = FALSE RETURNING id",
      [currentSid],
    );
    emitRevoke({ ids: rows.map(r => r.id) });
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Drop the cookie without touching the store (used after revoke-all). */
export async function dropCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
