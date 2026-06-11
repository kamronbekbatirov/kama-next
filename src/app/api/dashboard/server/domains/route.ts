import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type DomainRow = {
  data: {
    host: string;
    ok: boolean;
    status: number | null;
    latency_ms: number | null;
    ssl_days_left: number | null;
    error: string | null;
  };
  updated_at: string;
};

/**
 * Per-domain summary: current state + 24h uptime% + latency p50 / max.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await query<{
    key: string;
    data: DomainRow["data"];
    updated_at: string;
  }>(
    `SELECT key, data, updated_at FROM server_snapshot
     WHERE kind = 'domain' ORDER BY key`
  );

  const stats = await query<{
    host: string;
    uptime_pct: number;
    p50_ms: number | null;
    max_ms: number | null;
  }>(
    `
    WITH ok AS (
      SELECT
        regexp_replace(metric, '^dom\\.(.+)\\.ok$',         '\\1') AS host,
        AVG(value)::float8 * 100 AS uptime_pct
      FROM server_metrics
      WHERE metric LIKE 'dom.%.ok' AND ts >= NOW() - INTERVAL '24 hours'
      GROUP BY metric
    ),
    lat AS (
      SELECT
        regexp_replace(metric, '^dom\\.(.+)\\.latency_ms$', '\\1') AS host,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY value)::float8 AS p50_ms,
        MAX(value)::float8 AS max_ms
      FROM server_metrics
      WHERE metric LIKE 'dom.%.latency_ms' AND ts >= NOW() - INTERVAL '24 hours'
      GROUP BY metric
    )
    SELECT ok.host, ok.uptime_pct, lat.p50_ms, lat.max_ms
    FROM ok LEFT JOIN lat USING (host)
    `
  );

  const statsBy = new Map(stats.map((s) => [s.host, s]));

  return Response.json({
    domains: snapshot.map((s) => {
      const st = statsBy.get(s.key);
      return {
        ...s.data,
        host: s.key, // canonical: the snapshot key, not whatever's in data.host
        uptime_24h_pct: st?.uptime_pct ?? null,
        p50_ms_24h: st?.p50_ms ?? null,
        max_ms_24h: st?.max_ms ?? null,
        sampled_at: s.updated_at,
      };
    }),
  });
}
