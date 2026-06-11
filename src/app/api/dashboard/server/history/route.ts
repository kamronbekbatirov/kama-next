import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_PERIODS = {
  "1h": { interval: "1 hour", bucket: "30 seconds" },
  "6h": { interval: "6 hours", bucket: "1 minute" },
  "24h": { interval: "24 hours", bucket: "5 minutes" },
  "7d": { interval: "7 days", bucket: "30 minutes" },
} as const;

type Period = keyof typeof ALLOWED_PERIODS;

/**
 * GET /api/dashboard/server/history?metric=system.cpu_pct&period=1h
 *
 * Accepts comma-separated metric list. Returns:
 *   { period, bucket_seconds, series: { [metric]: [{t, v}, ...] } }
 *
 * The metric whitelist is implicit: any name written by the collector is allowed,
 * since the dashboard is single-tenant and behind auth. Period is whitelisted to
 * keep the time_bucket() argument safe and the result set bounded.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.authenticated) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const metricsParam = url.searchParams.get("metric") ?? "";
  const periodParam = (url.searchParams.get("period") ?? "1h") as Period;

  const config = ALLOWED_PERIODS[periodParam];
  if (!config) {
    return Response.json({ error: "bad period" }, { status: 400 });
  }

  const metrics = metricsParam
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[a-zA-Z0-9._-]+$/.test(m))
    .slice(0, 12);

  if (metrics.length === 0) {
    return Response.json({ error: "metric required" }, { status: 400 });
  }

  // Bucket by interval, taking AVG to smooth out the 30s sampling jitter.
  const rows = await query<{ metric: string; bucket: string; value: number }>(
    `
    SELECT
      metric,
      date_bin($1::interval, ts, TIMESTAMPTZ '2000-01-01') AS bucket,
      AVG(value)::float8 AS value
    FROM server_metrics
    WHERE metric = ANY($2::text[])
      AND ts >= NOW() - $3::interval
    GROUP BY metric, bucket
    ORDER BY bucket ASC
    `,
    [config.bucket, metrics, config.interval]
  );

  const series: Record<string, Array<{ t: string; v: number }>> = {};
  for (const m of metrics) series[m] = [];
  for (const r of rows) {
    series[r.metric]?.push({ t: r.bucket, v: r.value });
  }

  return Response.json({
    period: periodParam,
    bucket: config.bucket,
    series,
  });
}
