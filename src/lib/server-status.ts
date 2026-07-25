import { query } from "@/lib/db";

/**
 * Shared assembly of the live server status (snapshots written by
 * kama-metrics-collector every 30s) plus the derived alerts list.
 *
 * Single source of truth for /api/dashboard/server/current and for the
 * Claude assistant (system-prompt summary + get_server_status tool).
 */

type SnapshotRow = {
  kind: string;
  key: string;
  data: Record<string, unknown>;
  updated_at: string;
};

export type HostData = {
  cpu_pct: number;
  cores?: number;
  load: number[];
  uptime_s: number;
  mem: { used_b: number; total_b: number; buffers_b: number; cached_b: number };
  swap: { used_b: number; total_b: number };
  net: { rx_bps: number; tx_bps: number };
  disk: { total: number; used: number; free: number };
  caddy_errors_5m: number;
};

export type OpsData = {
  backups?: {
    clusters?: Record<
      string,
      { age_s: number | null; size_b: number | null; median7_b: number | null }
    >;
  };
  apt?: { pending_total?: number; pending_security?: number; reboot_required?: boolean };
  journal?: {
    ssh_accepted_24h?: number;
    ssh_last_ip?: string | null;
    ssh_distinct_ips_24h?: number;
    oom_kills_24h?: number;
  };
  fail2ban?: { banned_now?: number | null; banned_total?: number | null };
  vuln_audit?: {
    ran_at?: number | null;
    critical?: number | null;
    high?: number | null;
    flagged?: string[];
  };
  failed_units?: { count: number; names: string[] };
  inodes?: { total: number; used: number };
};

export type ServiceEntry = {
  unit: string;
  active?: boolean;
  state?: string;
  main_pid?: number;
  rss_kb?: number;
  uptime_s?: number;
  restarts?: number;
};

export type DomainEntry = {
  host: string;
  ok?: boolean;
  status?: number | null;
  latency_ms?: number | null;
  ssl_days_left?: number | null;
  error?: string | null;
};

export type DatabaseEntry = {
  connections?: number;
  longest_lock_s?: number;
  databases?: Array<{ name: string; size_b: number }>;
};

export type ServerAlert = { severity: "warn" | "crit"; message: string };

export interface ServerStatus {
  updated_at: string | null;
  host: HostData | null;
  services: ServiceEntry[];
  domains: DomainEntry[];
  database: DatabaseEntry | null;
  ops: OpsData | null;
  alerts: ServerAlert[];
}

export async function getServerStatus(): Promise<ServerStatus> {
  const rows = await query<SnapshotRow>(
    "SELECT kind, key, data, updated_at FROM server_snapshot ORDER BY kind, key"
  );

  const grouped: Record<string, SnapshotRow[]> = {
    system: [],
    service: [],
    domain: [],
    database: [],
    ops: [],
  };
  for (const r of rows) {
    if (grouped[r.kind]) grouped[r.kind].push(r);
  }

  const host = grouped.system[0]?.data as HostData | undefined;
  const ops = grouped.ops[0]?.data as OpsData | undefined;

  const alerts: ServerAlert[] = [];

  if (host) {
    const memPct = (host.mem.used_b / Math.max(host.mem.total_b, 1)) * 100;
    if (memPct > 90) alerts.push({ severity: "crit", message: `RAM at ${memPct.toFixed(0)}% (>90%)` });
    else if (memPct > 80) alerts.push({ severity: "warn", message: `RAM at ${memPct.toFixed(0)}% (>80%)` });

    const diskPct = (host.disk.used / Math.max(host.disk.total, 1)) * 100;
    if (diskPct > 90) alerts.push({ severity: "crit", message: `Disk at ${diskPct.toFixed(0)}% (>90%)` });
    else if (diskPct > 80) alerts.push({ severity: "warn", message: `Disk at ${diskPct.toFixed(0)}% (>80%)` });

    if (host.swap.total_b > 0) {
      const swapPct = (host.swap.used_b / host.swap.total_b) * 100;
      if (swapPct > 50) alerts.push({ severity: "warn", message: `Swap at ${swapPct.toFixed(0)}% — RAM pressure` });
    }

    if (host.caddy_errors_5m > 20) {
      alerts.push({ severity: "warn", message: `Caddy ${host.caddy_errors_5m} warn/err in last 5 min` });
    }
  }

  for (const s of grouped.service) {
    const d = s.data as { active: boolean; state: string; restarts?: number };
    if (!d.active) alerts.push({ severity: "crit", message: `${s.key} is ${d.state}` });
    const restarts = d.restarts ?? 0;
    if (restarts >= 25) alerts.push({ severity: "crit", message: `${s.key} crash-looping (${restarts} auto-restarts)` });
    else if (restarts >= 5) alerts.push({ severity: "warn", message: `${s.key} unstable — ${restarts} auto-restarts` });
  }

  for (const d of grouped.domain) {
    const dd = d.data as { ok: boolean; ssl_days_left: number | null; error: string | null };
    if (!dd.ok) alerts.push({ severity: "crit", message: `${d.key} unreachable: ${dd.error ?? "?"}` });
    if (dd.ssl_days_left !== null && dd.ssl_days_left !== undefined && dd.ssl_days_left < 14) {
      alerts.push({
        severity: dd.ssl_days_left < 7 ? "crit" : "warn",
        message: `${d.key} SSL expires in ${dd.ssl_days_left}d`,
      });
    }
  }

  if (ops) {
    for (const [ver, b] of Object.entries(ops.backups?.clusters ?? {})) {
      if (b.age_s == null) {
        alerts.push({ severity: "warn", message: `PG${ver}: no backup found` });
      } else if (b.age_s > 26 * 3600) {
        alerts.push({
          severity: "crit",
          message: `PG${ver} backup is ${Math.floor(b.age_s / 3600)}h old`,
        });
      } else if (
        b.size_b != null && b.median7_b != null && b.median7_b > 0 &&
        b.size_b < b.median7_b * 0.5
      ) {
        alerts.push({
          severity: "warn",
          message: `PG${ver} backup unusually small (${Math.round((b.size_b / b.median7_b) * 100)}% of median)`,
        });
      }
    }
    if (ops.failed_units && ops.failed_units.count > 0) {
      alerts.push({
        severity: "crit",
        message: `${ops.failed_units.count} failed systemd unit(s): ${ops.failed_units.names.slice(0, 3).join(", ")}`,
      });
    }
    if (ops.apt?.reboot_required) {
      alerts.push({ severity: "warn", message: "Reboot required (new kernel)" });
    }
    const sec = ops.apt?.pending_security ?? 0;
    if (sec > 0) alerts.push({ severity: "warn", message: `${sec} security update(s) pending` });
    const oom = ops.journal?.oom_kills_24h ?? 0;
    if (oom > 0) alerts.push({ severity: "crit", message: `${oom} OOM kill(s) in the last 24h` });
    const vulnCrit = ops.vuln_audit?.critical ?? 0;
    if (vulnCrit > 0) {
      alerts.push({
        severity: "crit",
        message: `vuln-audit: ${vulnCrit} critical dependency advisories`,
      });
    }
    if (ops.inodes && ops.inodes.total > 0) {
      const inoPct = (ops.inodes.used / ops.inodes.total) * 100;
      if (inoPct > 90) alerts.push({ severity: "crit", message: `Inodes at ${inoPct.toFixed(0)}% (>90%)` });
      else if (inoPct > 80) alerts.push({ severity: "warn", message: `Inodes at ${inoPct.toFixed(0)}% (>80%)` });
    }
  }

  return {
    updated_at: rows[0]?.updated_at ?? null,
    host: host ?? null,
    services: grouped.service.map((s) => ({ ...(s.data as ServiceEntry), unit: s.key })),
    domains: grouped.domain.map((d) => ({ ...(d.data as DomainEntry), host: d.key })),
    database: (grouped.database[0]?.data as DatabaseEntry | undefined) ?? null,
    ops: ops ?? null,
    alerts,
  };
}
