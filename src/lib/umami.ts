/**
 * Shared client for the self-hosted Umami instance (localhost:3070).
 * Used by the dashboard analytics routes — server-to-server over localhost,
 * with a cached login token.
 *
 * Env (in /etc/kama-next.env): UMAMI_URL, UMAMI_USERNAME, UMAMI_PASSWORD,
 * UMAMI_WEBSITE_ID (the default site).
 */

const UMAMI_URL = process.env.UMAMI_URL;
const UMAMI_USERNAME = process.env.UMAMI_USERNAME;
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD;

export const DEFAULT_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID;

export function umamiConfigured(): boolean {
  return !!(UMAMI_URL && UMAMI_USERNAME && UMAMI_PASSWORD);
}

export const PERIODS: Record<string, { ms: number; unit: "hour" | "day" }> = {
  "24h": { ms: 24 * 3600_000, unit: "hour" },
  "7d": { ms: 7 * 86400_000, unit: "day" },
  "30d": { ms: 30 * 86400_000, unit: "day" },
};

export type UmamiPeriodKey = keyof typeof PERIODS;
export type Metric = { x: string | null; y: number };
export type UmamiStats = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  comparison?: { pageviews: number; visitors: number; visits: number; bounces: number; totaltime: number };
};
export type UmamiWebsite = { id: string; name: string; domain: string };

// Module-level token cache (re-login on expiry or 401).
let tokenCache: { token: string; at: number } | null = null;
const TOKEN_TTL_MS = 50 * 60_000;

async function login(): Promise<string> {
  const r = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: UMAMI_USERNAME, password: UMAMI_PASSWORD }),
  });
  if (!r.ok) throw new Error(`umami login ${r.status}`);
  const j = await r.json();
  if (!j.token) throw new Error("umami login: no token");
  tokenCache = { token: j.token, at: Date.now() };
  return j.token;
}

async function token(): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.token;
  return login();
}

export async function umami<T>(path: string): Promise<T> {
  let t = await token();
  let r = await fetch(`${UMAMI_URL}${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (r.status === 401) {
    t = await login();
    r = await fetch(`${UMAMI_URL}${path}`, { headers: { Authorization: `Bearer ${t}` } });
  }
  if (!r.ok) throw new Error(`umami ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

/** All websites registered in Umami (id, name, domain). */
export async function listWebsites(): Promise<UmamiWebsite[]> {
  const r = await umami<{ data?: UmamiWebsite[] } | UmamiWebsite[]>("/api/websites?pageSize=200");
  const arr = Array.isArray(r) ? r : r.data ?? [];
  return arr.map((w) => ({ id: w.id, name: w.name, domain: w.domain }));
}

export function periodRange(periodKey: string): { startAt: number; endAt: number; unit: "hour" | "day" } {
  const period = PERIODS[periodKey] ?? PERIODS["24h"];
  const endAt = Date.now();
  return { startAt: endAt - period.ms, endAt, unit: period.unit };
}
