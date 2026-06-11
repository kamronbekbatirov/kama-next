-- Server-wide monitoring metrics timeseries.
-- Populated by an out-of-band collector (kama-metrics-collector.service)
-- every 30s. Read by /api/dashboard/server/* endpoints.
--
-- One row per (timestamp, metric-key). The metric key namespaces what is
-- being measured so we can store anything (system, per-service RSS,
-- per-domain latency, postgres connections, …) in a single wide table
-- without schema churn when projects come and go.

CREATE TABLE IF NOT EXISTS server_metrics (
  ts      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric  TEXT        NOT NULL,
  value   DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (ts, metric)
);

CREATE INDEX IF NOT EXISTS idx_server_metrics_metric_ts
  ON server_metrics (metric, ts DESC);

-- Per-sample state of each discovered systemd unit / domain / etc.
-- The collector writes the full snapshot each tick so the API can render
-- "current" without having to find the latest row per metric.
CREATE TABLE IF NOT EXISTS server_snapshot (
  kind        TEXT        NOT NULL,                -- 'service' | 'domain' | 'database' | 'system'
  key         TEXT        NOT NULL,                -- e.g. 'assista-backend.service' | 'kama.uz' | 'assista'
  data        JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kind, key)
);

CREATE INDEX IF NOT EXISTS idx_server_snapshot_kind
  ON server_snapshot (kind);

GRANT ALL ON TABLE server_metrics  TO kama_app;
GRANT ALL ON TABLE server_snapshot TO kama_app;
