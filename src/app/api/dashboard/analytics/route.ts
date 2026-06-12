import { getSession } from "@/lib/auth";
import {
  umami, umamiConfigured, periodRange, DEFAULT_WEBSITE_ID,
  type Metric, type UmamiStats,
} from "@/lib/umami";

export const dynamic = "force-dynamic";

/**
 * Detailed analytics for one website (default: UMAMI_WEBSITE_ID, or ?website=<id>).
 * Reads the self-hosted Umami over localhost and reshapes for the Analytics tab.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.authenticated) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const websiteId = sp.get("website") || DEFAULT_WEBSITE_ID;

  if (!umamiConfigured() || !websiteId) {
    return Response.json({ configured: false });
  }

  const periodKey = sp.get("period") ?? "24h";
  const { startAt, endAt, unit } = periodRange(periodKey);
  const base = `/api/websites/${websiteId}`;
  const range = `startAt=${startAt}&endAt=${endAt}`;

  try {
    const [stats, series, pages, referrers, countries, browsers] = await Promise.all([
      umami<UmamiStats>(`${base}/stats?${range}`),
      umami<{ pageviews: Metric[]; sessions: Metric[] }>(
        `${base}/pageviews?${range}&unit=${unit}&timezone=UTC`,
      ),
      umami<Metric[]>(`${base}/metrics?${range}&type=path&limit=8`),
      umami<Metric[]>(`${base}/metrics?${range}&type=referrer&limit=8`),
      umami<Metric[]>(`${base}/metrics?${range}&type=country&limit=8`),
      umami<Metric[]>(`${base}/metrics?${range}&type=browser&limit=6`),
    ]);

    return Response.json({
      configured: true, ok: true, period: periodKey,
      stats, series, pages, referrers, countries, browsers,
    });
  } catch (e) {
    return Response.json({
      configured: true, ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
