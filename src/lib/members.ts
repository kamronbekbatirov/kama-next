import { randomUUID, randomBytes, createHash } from "crypto";
import { query } from "@/lib/db";
import { tgUserPhotoFileId } from "@/lib/telegram";

export type MemberRole = "owner" | "guest";

export interface Member {
  id: string;
  telegram_id: string | null;
  role: MemberRole;
  display_name: string;
  username: string | null;
  tz: string | null;
  lang: "en" | "ru" | "uz" | null;
  revoked_at: string | null;
}

/** The row seeded by migration 011. Stable so the owner is never re-created. */
export const OWNER_MEMBER_ID = "00000000-0000-0000-0000-000000000001";

const SELECT_COLS =
  "id, telegram_id, role, display_name, username, tz, lang, revoked_at::text AS revoked_at";

/**
 * The owner's Telegram id lives in the environment, which `psql` cannot read,
 * so the migration seeds the row without it. This stamps it on the first login
 * — a write on the auth path only, never on a read.
 */
export async function ensureOwnerMember(): Promise<Member | null> {
  const telegramId = process.env.OWNER_TELEGRAM_ID ?? null;
  const rows = await query<Member>(
    `UPDATE members
        SET telegram_id = COALESCE(telegram_id, $2),
            revoked_at  = NULL
      WHERE id = $1
      RETURNING ${SELECT_COLS}`,
    [OWNER_MEMBER_ID, telegramId],
  );
  return rows[0] ?? null;
}

export async function getMemberById(id: string): Promise<Member | null> {
  const rows = await query<Member>(
    `SELECT ${SELECT_COLS} FROM members WHERE id = $1 AND revoked_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/** Active member for a Telegram id. Used by both the Mini App and the bot. */
export async function getMemberByTelegramId(telegramId: string): Promise<Member | null> {
  if (!telegramId) return null;
  const rows = await query<Member>(
    `SELECT ${SELECT_COLS} FROM members WHERE telegram_id = $1 AND revoked_at IS NULL`,
    [telegramId],
  );
  return rows[0] ?? null;
}

export async function listMembers(): Promise<Member[]> {
  return query<Member>(
    `SELECT ${SELECT_COLS} FROM members ORDER BY role DESC, created_at ASC`,
  );
}

/** Create or re-activate a guest. Re-inviting a revoked member restores them. */
export async function upsertGuest(opts: {
  telegramId?: string | null;
  displayName: string;
  invitedBy: string;
}): Promise<Member> {
  const rows = await query<Member>(
    `INSERT INTO members (id, telegram_id, role, display_name, invited_by)
     VALUES ($1, $2, 'guest', $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE
       SET revoked_at = NULL, display_name = EXCLUDED.display_name
     RETURNING ${SELECT_COLS}`,
    [randomUUID(), opts.telegramId || null, opts.displayName, opts.invitedBy],
  );
  return rows[0];
}

export async function touchMemberSeen(id: string): Promise<void> {
  await query(
    "UPDATE members SET last_seen_at = NOW() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '5 minutes')",
    [id],
  );
}

// ─── Invites ─────────────────────────────────────────────────────────────────
//
// Guests never get a password. They get a single-use link: 256 bits of CSPRNG,
// stored only as a hash (a database read yields no working invites), delivered
// over Telegram to one specific account, and valid for 72 hours. After
// redemption the durable credential is the same HMAC-signed, server-revocable
// cookie the owner uses.

const INVITE_TTL_HOURS = 72;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint an invite for a member. Returns the raw token — shown exactly once. */
export async function createInvite(memberId: string, createdBy: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO member_invites (id, member_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval)`,
    [randomUUID(), memberId, hashToken(token), createdBy, String(INVITE_TTL_HOURS)],
  );
  return token;
}

/**
 * Redeem an invite. The `AND used_at IS NULL` inside the UPDATE is what makes
 * single-use atomic — this codebase has no transaction helper, and none is
 * needed for a conditional update that returns what it changed.
 */
export async function redeemInvite(token: string, ip: string | null): Promise<Member | null> {
  if (!token) return null;
  const rows = await query<{ member_id: string }>(
    `UPDATE member_invites
        SET used_at = NOW(), used_ip = $2
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING member_id`,
    [hashToken(token), ip],
  );
  if (rows.length === 0) return null;
  return getMemberById(rows[0].member_id);
}

/** Revoke a member: kill their invites here, sessions are killed by auth.ts. */
export async function revokeMemberInvites(memberId: string): Promise<void> {
  await query("DELETE FROM member_invites WHERE member_id = $1 AND used_at IS NULL", [memberId]);
}

/**
 * Keep a member's profile photo current, at most once a day.
 *
 * Called opportunistically rather than on a schedule: whoever opens the board
 * refreshes their own face, and a newly invited member gets one immediately, so
 * the board fills in through ordinary use. Failure is not worth reporting — a
 * missing avatar falls back to initials.
 */
export async function refreshMemberPhoto(
  memberId: string, telegramId: string | null, force = false,
): Promise<void> {
  if (!telegramId) return;
  const rows = await query<{ stale: boolean }>(
    `SELECT (photo_checked_at IS NULL OR photo_checked_at < NOW() - INTERVAL '1 day') AS stale
       FROM members WHERE id = $1`,
    [memberId],
  );
  if (!rows[0] || (!rows[0].stale && !force)) return;
  const fileId = await tgUserPhotoFileId(telegramId);
  await query(
    "UPDATE members SET photo_file_id = $2, photo_checked_at = NOW() WHERE id = $1",
    [memberId, fileId],
  );
}

/** The stored file_id for a member, for the avatar proxy. */
export async function memberPhotoFileId(memberId: string): Promise<string | null> {
  const rows = await query<{ photo_file_id: string | null }>(
    "SELECT photo_file_id FROM members WHERE id = $1 AND revoked_at IS NULL",
    [memberId],
  );
  return rows[0]?.photo_file_id ?? null;
}
