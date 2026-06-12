import { getSession } from "@/lib/auth";
import {
  umami, umamiConfigured, listWebsites, periodRange,
  type Metric, type UmamiStats,
} from "@/lib/umami";

export const dynamic = "force-dynamic";

/**
 * Overview across ALL tracked websites: each site's headline stats + a small
 * pageviews series for a sparkline. Powers the "All sites" view of the
 * Analytics tab.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.authenticated) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!umamiConfigured()) return Response.json({ configured: false });

  const periodKey = new URL(req.url).searchParams.get("period") ?? "24h";
  const { startAt, endAt, unit } = periodRange(periodKey);
  const range = `startAt=${startAt}&endAt=${endAt}`;

  try {
    const websites = await listWebsites();
    const sites = await Promise.all(
      websites.map(async (w) => {
        try {
          const [stats, pv] = await Promise.all([
            umami<UmamiStats>(`/api/websites/${w.id}/stats?${range}`),
            umami<{ pageviews: Metric[] }>(
              `/api/websites/${w.id}/pageviews?${range}&unit=${unit}&timezone=UTC`,
            ),
          ]);
          return { id: w.id, name: w.name, domain: w.domain, stats, series: pv.pageviews };
        } catch {
          return { id: w.id, name: w.name, domain: w.domain, stats: null, series: [] };
        }
      }),
    );
    // Sort by visitors desc so the busiest sites lead.
    sites.sort((a, b) => (b.stats?.visitors ?? 0) - (a.stats?.visitors ?? 0));

    return Response.json({ configured: true, ok: true, period: periodKey, sites });
  } catch (e) {
    return Response.json({
      configured: true, ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
