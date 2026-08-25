import { resolveSession, type Session } from "@/lib/auth";

/**
 * Route guards.
 *
 * This module exists so that reading a session and choosing an audience are the
 * same action. `resolveSession()` answers "who is calling"; it never answers
 * "may they". Routes import from here, and the guard they pick is the
 * authorization decision — there is no way to accidentally not make one.
 *
 * The default is `requireOwner`. Everything under /api/dashboard is the owner's
 * private life, so a route that nobody thought about stays closed rather than
 * leaking.
 */

export class Unauthorized extends Error {
  constructor() {
    // The message is load-bearing: existing catch blocks discriminate on
    // `msg === "unauthorized"` to answer 401 instead of 500.
    super("unauthorized");
  }
}

/** DEFAULT. Owner-only — everything under /api/dashboard. */
export async function requireOwner(): Promise<Session> {
  const s = await resolveSession();
  if (!s || s.role !== "owner") throw new Unauthorized();
  return s;
}

/**
 * Explicit opt-in: any active member, owner or guest.
 *
 * Returns the session so the handler MUST have the member id in hand — every
 * statement it writes is expected to scope by it.
 */
export async function requireMember(): Promise<Session> {
  const s = await resolveSession();
  if (!s) throw new Unauthorized();
  return s;
}

export const UNAUTHORIZED = () =>
  Response.json({ error: "unauthorized" }, { status: 401 });
