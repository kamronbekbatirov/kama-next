import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Row = {
  unit: string;
  data: {
    active: boolean;
    state: string;
    main_pid: number;
    rss_kb: number;
    uptime_s: number;
  };
  updated_at: string;
};

/**
 * Returns the latest snapshot for every discovered systemd service, plus a
 * per-service uptime% over the last 24h computed from the
 * svc.<unit>.active timeseries.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await query<{
    key: string;
    data: Row["data"];
    updated_at: string;
  }>(
    `SELECT key, data, updated_at FROM server_snapshot
     WHERE kind = 'service' ORDER BY key`
  );

  // 24h uptime ratio per unit: avg(active) where active is 0/1.
  const uptime = await query<{ unit: string; uptime_pct: number }>(
    `
    SELECT
      regexp_replace(metric, '^svc\\.(.+)\\.active$', '\\1') AS unit,
      AVG(value)::float8 * 100 AS uptime_pct
    FROM server_metrics
    WHERE metric LIKE 'svc.%.active'
      AND ts >= NOW() - INTERVAL '24 hours'
    GROUP BY metric
    `
  );
  const uptimeBy = new Map(uptime.map((u) => [u.unit + ".service", u.uptime_pct]));

  return Response.json({
    services: snapshot.map((s) => ({
      unit: s.key,
      ...s.data,
      uptime_24h_pct: uptimeBy.get(s.key) ?? null,
      sampled_at: s.updated_at,
    })),
  });
}
