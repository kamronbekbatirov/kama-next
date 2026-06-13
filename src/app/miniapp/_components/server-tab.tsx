"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Cpu, Database, Globe, HardDrive,
  MemoryStick, Network, Server, ShieldAlert, Timer, Wrench, Zap,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { translations, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/providers";
import { api } from "./_shared";
import { SectionHeader, SoftCard, StatBlock, Chip, MetricRow, Pill } from "./dashboard-ui";
import { Sparkline } from "./server-sparkline";
import { AnalyticsTab } from "./analytics-tab";
import { InboxTab } from "./inbox-tab";

// ---------- Types ----------------------------------------------------------

interface HostData {
  cpu_pct: number;
  cores?: number;
  load: [number, number, number];
  uptime_s: number;
  mem: { used_b: number; total_b: number; buffers_b: number; cached_b: number };
  swap: { used_b: number; total_b: number };
  net: { rx_bps: number; tx_bps: number };
  disk: { total: number; used: number; free: number };
  caddy_errors_5m: number;
}

interface ServiceState {
  unit: string;
  active: boolean;
  state: string;
  main_pid: number;
  rss_kb: number;
  uptime_s: number;
  uptime_24h_pct?: number | null;
}

interface DomainState {
  host: string;
  ok: boolean;
  status: number | null;
  latency_ms: number | null;
  ssl_days_left: number | null;
  error: string | null;
  uptime_24h_pct?: number | null;
  p50_ms_24h?: number | null;
  max_ms_24h?: number | null;
}

interface DatabaseState {
  connections: number;
  longest_lock_s: number;
  databases: Array<{ name: string; size_b: number }>;
}

interface OpsData {
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
  pg15?: { connections?: number | null; databases?: Array<{ name: string; size_b: number }> };
  vuln_audit?: {
    ran_at?: number | null;
    critical?: number | null;
    high?: number | null;
    flagged?: string[];
  };
  failed_units?: { count: number; names: string[] };
  inodes?: { total: number; used: number };
}

interface Alert {
  severity: "warn" | "crit";
  message: string;
}

interface CurrentResponse {
  updated_at: string | null;
  host: HostData | null;
  services: ServiceState[];
  domains: DomainState[];
  database: DatabaseState | null;
  ops: OpsData | null;
  alerts: Alert[];
}

interface HistoryResponse {
  period: string;
  bucket: string;
  series: Record<string, Array<{ t: string; v: number }>>;
}

// ---------- Formatters -----------------------------------------------------

const fmtBytes = (b: number): string => {
  if (b == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

const fmtRate = (bps: number): string => `${fmtBytes(bps)}/s`;

const fmtDuration = (s: number): string => {
  if (!s || s < 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const fmtPct = (n: number | null | undefined): string =>
  n == null ? "—" : `${n.toFixed(n < 10 ? 1 : 0)}%`;

const toneForUsage = (pct: number): "neutral" | "warning" | "danger" =>
  pct > 90 ? "danger" : pct > 80 ? "warning" : "neutral";

// ---------- Hooks ----------------------------------------------------------

function usePolled<T>(url: string, intervalMs: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await api(url);
        if (!cancelled) setData(r as T);
      } catch { /* keep prev */ }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [url, intervalMs]);
  return data;
}

// ---------- Sub-components -------------------------------------------------

function AlertsCard({ alerts, t }: { alerts: Alert[]; t: typeof translations.en }) {
  if (alerts.length === 0) {
    return (
      <SoftCard className="border-emerald-500/30">
        <div className="flex items-center gap-2 text-sm text-emerald-500">
          <Zap size={16} />
          <span>{t.dash.server.allHealthy}</span>
        </div>
      </SoftCard>
    );
  }
  return (
    <SoftCard className="border-yellow-500/30">
      <SectionHeader eyebrow={t.dash.server.alerts} title={`${alerts.length}`} />
      <ul className="space-y-1.5">
        {alerts.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {a.severity === "crit" ? (
              <ShieldAlert size={14} className="text-red-500 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
            )}
            <span className={a.severity === "crit" ? "text-red-500" : "text-yellow-500"}>
              {a.message}
            </span>
          </li>
        ))}
      </ul>
    </SoftCard>
  );
}

function HostCard({ host, history, t }: {
  host: HostData;
  history: HistoryResponse | null;
  t: typeof translations.en;
}) {
  const memPct = (host.mem.used_b / Math.max(host.mem.total_b, 1)) * 100;
  const diskPct = (host.disk.used / Math.max(host.disk.total, 1)) * 100;
  const swapPct = host.swap.total_b > 0
    ? (host.swap.used_b / host.swap.total_b) * 100
    : 0;

  const cpuPoints = history?.series["system.cpu_pct"]?.map((p) => p.v) ?? [];
  const memPoints = history?.series["system.mem_used_b"]?.map(
    (p) => (p.v / Math.max(host.mem.total_b, 1)) * 100,
  ) ?? [];

  return (
    <SoftCard>
      <SectionHeader
        eyebrow={t.dash.server.host}
        title={t.dash.server.overview}
        trailing={
          <Chip>{t.dash.server.uptime}: {fmtDuration(host.uptime_s)}</Chip>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <StatBlock
            value={`${host.cpu_pct.toFixed(0)}%`}
            label={t.dash.server.cpu}
            tone={toneForUsage(host.cpu_pct)}
            hint={`load ${host.load[0].toFixed(2)}${host.cores ? ` / ${host.cores}` : ""}`}
          />
          <div className="mt-2 text-[var(--accent)]">
            <Sparkline data={cpuPoints} width={120} height={24} min={0} max={100} />
          </div>
        </div>
        <div>
          <StatBlock
            value={fmtPct(memPct)}
            label={t.dash.server.ram}
            tone={toneForUsage(memPct)}
            hint={`${fmtBytes(host.mem.used_b)} / ${fmtBytes(host.mem.total_b)}`}
          />
          <div className="mt-2 text-[var(--accent)]">
            <Sparkline data={memPoints} width={120} height={24} min={0} max={100} />
          </div>
        </div>
        <div>
          <StatBlock
            value={fmtPct(diskPct)}
            label={t.dash.server.disk}
            tone={toneForUsage(diskPct)}
            hint={`${fmtBytes(host.disk.free)} ${t.dash.server.free}`}
          />
        </div>
        <div>
          <StatBlock
            value={fmtPct(swapPct)}
            label={t.dash.server.swap}
            tone={swapPct > 50 ? "warning" : "neutral"}
            hint={`${fmtBytes(host.swap.used_b)} ${t.dash.server.swapUsed}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-[var(--card-border)]">
        <div className="text-xs text-[var(--muted)] flex items-center gap-2">
          <Network size={12} /> ↓ {fmtRate(host.net.rx_bps)} · ↑ {fmtRate(host.net.tx_bps)}
        </div>
        <div className="text-xs text-[var(--muted)] flex items-center gap-2 justify-end">
          <Activity size={12} /> caddy 5m: {host.caddy_errors_5m}
        </div>
      </div>
    </SoftCard>
  );
}

function ServiceCard({ s, t }: { s: ServiceState; t: typeof translations.en }) {
  const tag = s.unit.replace(".service", "");
  return (
    <SoftCard className="px-3 py-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" title={s.unit}>{tag}</div>
          <div className="text-[10px] text-[var(--muted)] mt-0.5">
            PID {s.main_pid || "—"} · {fmtDuration(s.uptime_s)}
          </div>
        </div>
        <span
          className={`shrink-0 inline-block w-2 h-2 rounded-full mt-1 ${
            s.active ? "bg-emerald-500" : "bg-red-500"
          }`}
          title={s.state}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--muted)]">
          {s.rss_kb > 0 ? `${(s.rss_kb / 1024).toFixed(1)} MB` : "—"}
        </span>
        {s.uptime_24h_pct != null && (
          <span className={s.uptime_24h_pct < 95 ? "text-yellow-500" : "text-[var(--muted)]"}>
            {fmtPct(s.uptime_24h_pct)} {t.dash.server.uptime24}
          </span>
        )}
      </div>
    </SoftCard>
  );
}

function DomainCard({ d, t }: { d: DomainState; t: typeof translations.en }) {
  const sslTone =
    d.ssl_days_left == null ? "" :
    d.ssl_days_left < 7 ? "text-red-500" :
    d.ssl_days_left < 30 ? "text-yellow-500" :
    "text-[var(--muted)]";

  return (
    <SoftCard className="px-3 py-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{d.host}</div>
          <div className="text-[10px] text-[var(--muted)] mt-0.5">
            {d.status ? `HTTP ${d.status}` : (d.error ?? "—")}
          </div>
        </div>
        <span
          className={`shrink-0 inline-block w-2 h-2 rounded-full mt-1 ${
            d.ok ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-[var(--muted)] uppercase tracking-wider text-[9px]">
            {t.dash.server.latency}
          </div>
          <div className="tabular-nums">{d.latency_ms ? `${d.latency_ms.toFixed(0)}ms` : "—"}</div>
          {d.p50_ms_24h != null && (
            <div className="text-[9px] text-[var(--muted)] tabular-nums">
              p50 {d.p50_ms_24h.toFixed(0)} · max {d.max_ms_24h?.toFixed(0) ?? "—"}
            </div>
          )}
        </div>
        <div>
          <div className="text-[var(--muted)] uppercase tracking-wider text-[9px]">
            {t.dash.server.uptime24}
          </div>
          <div className="tabular-nums">{fmtPct(d.uptime_24h_pct)}</div>
        </div>
        <div>
          <div className="text-[var(--muted)] uppercase tracking-wider text-[9px]">SSL</div>
          <div className={`tabular-nums ${sslTone}`}>
            {d.ssl_days_left != null ? `${d.ssl_days_left}d` : "—"}
          </div>
        </div>
      </div>
    </SoftCard>
  );
}

function OpsCard({ ops, t }: { ops: OpsData; t: typeof translations.en }) {
  const fmtAge = (s: number | null | undefined): string =>
    s == null ? "—" : s < 3600
      ? `${Math.floor(s / 60)}m`
      : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

  // "16" first, then "15"
  const backups = Object.entries(ops.backups?.clusters ?? {}).sort(([a], [b]) =>
    b.localeCompare(a),
  );
  const apt = ops.apt;
  const j = ops.journal;
  const f2b = ops.fail2ban;
  const va = ops.vuln_audit;
  const failed = ops.failed_units;
  const inoPct =
    ops.inodes && ops.inodes.total > 0
      ? (ops.inodes.used / ops.inodes.total) * 100
      : null;

  return (
    <SoftCard>
      <SectionHeader
        eyebrow={t.dash.server.ops}
        title={t.dash.server.opsTitle}
        trailing={<Wrench size={14} className="text-[var(--muted)]" />}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        {backups.map(([ver, b]) => (
          <MetricRow
            key={ver}
            label={`${t.dash.server.backup} PG${ver}`}
            value={
              b.age_s == null
                ? "—"
                : `${fmtAge(b.age_s)}${b.size_b != null ? ` · ${fmtBytes(b.size_b)}` : ""}`
            }
            tone={b.age_s == null || b.age_s > 26 * 3600 ? "danger" : "neutral"}
          />
        ))}
        <MetricRow
          label={t.dash.server.updates}
          value={
            <span className="inline-flex items-center gap-1.5">
              {`${apt?.pending_security ?? "—"} / ${apt?.pending_total ?? "—"}`}
              {apt?.reboot_required && (
                <Chip tone="warning">{t.dash.server.rebootRequired}</Chip>
              )}
            </span>
          }
          tone={(apt?.pending_security ?? 0) > 0 ? "warning" : "neutral"}
        />
        <MetricRow
          label={t.dash.server.failedUnits}
          value={
            failed
              ? failed.count > 0
                ? `${failed.count} · ${failed.names.slice(0, 2).join(", ")}`
                : "0"
              : "—"
          }
          tone={(failed?.count ?? 0) > 0 ? "danger" : "neutral"}
        />
        <MetricRow
          label={t.dash.server.oomKills}
          value={j?.oom_kills_24h ?? "—"}
          tone={(j?.oom_kills_24h ?? 0) > 0 ? "danger" : "neutral"}
        />
        <MetricRow
          label={t.dash.server.sshLogins}
          value={
            j
              ? `${j.ssh_accepted_24h}${j.ssh_last_ip ? ` · ${j.ssh_last_ip}` : ""}`
              : "—"
          }
        />
        <MetricRow
          label="fail2ban"
          value={f2b ? `${f2b.banned_now ?? "—"} / ${f2b.banned_total ?? "—"}` : "—"}
        />
        <MetricRow
          label={t.dash.server.vulnAudit}
          value={va && va.critical != null ? `C=${va.critical} · H=${va.high}` : "—"}
          tone={
            (va?.critical ?? 0) > 0
              ? "danger"
              : (va?.high ?? 0) > 0
                ? "warning"
                : "neutral"
          }
        />
        <MetricRow
          label={t.dash.server.inodes}
          value={inoPct == null ? "—" : `${inoPct.toFixed(inoPct < 10 ? 1 : 0)}%`}
          tone={
            inoPct != null && inoPct > 90
              ? "danger"
              : inoPct != null && inoPct > 80
                ? "warning"
                : "neutral"
          }
        />
      </div>
      {(va?.flagged?.length ?? 0) > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-0.5">
          {va?.flagged?.slice(0, 4).map((f, i) => (
            <div key={i} className="text-[10px] text-[var(--muted)] truncate">
              {f}
            </div>
          ))}
        </div>
      )}
    </SoftCard>
  );
}

function DatabaseCard({ db, pg15, t }: {
  db: DatabaseState;
  pg15?: OpsData["pg15"] | null;
  t: typeof translations.en;
}) {
  return (
    <SoftCard>
      <SectionHeader
        eyebrow={t.dash.server.postgres}
        title={`${db.connections + (pg15?.connections ?? 0)} ${t.dash.server.connections}`}
        trailing={
          db.longest_lock_s > 1 ? (
            <Chip>
              <Timer size={10} className="inline" /> {db.longest_lock_s.toFixed(0)}s lock
            </Chip>
          ) : null
        }
      />
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-1.5">
        PG 16 · {db.connections} {t.dash.server.connections}
      </div>
      <div className="space-y-1.5">
        {db.databases.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <span className="font-medium">{d.name}</span>
            <span className="text-[var(--muted)] tabular-nums">{fmtBytes(d.size_b)}</span>
          </div>
        ))}
      </div>
      {pg15 && (
        <>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-4 mb-1.5">
            PG 15 · {pg15.connections ?? "—"} {t.dash.server.connections}
          </div>
          <div className="space-y-1.5">
            {(pg15.databases ?? []).map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="font-medium">{d.name}</span>
                <span className="text-[var(--muted)] tabular-nums">{fmtBytes(d.size_b)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </SoftCard>
  );
}

function HistoryChart({
  title,
  series,
  unit,
  color,
}: {
  title: string;
  series: Array<{ t: string; v: number }>;
  unit: string;
  color: string;
}) {
  const data = series.map((p) => ({ t: new Date(p.t).getTime(), v: p.v }));
  return (
    <SoftCard>
      <SectionHeader eyebrow={title} title={unit} />
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => {
                const d = new Date(v);
                return `${d.getHours().toString().padStart(2, "0")}:${d
                  .getMinutes()
                  .toString()
                  .padStart(2, "0")}`;
              }}
              fontSize={9}
              stroke="currentColor"
              opacity={0.4}
            />
            <YAxis fontSize={9} stroke="currentColor" opacity={0.4} />
            <Tooltip
              labelFormatter={(v) => new Date(v as number).toLocaleString()}
              formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v))}
              contentStyle={{ fontSize: 11, backgroundColor: "var(--card)", border: "1px solid var(--card-border)" }}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#g-${title})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SoftCard>
  );
}

// ---------- Main component -------------------------------------------------

/**
 * ServerTab is a switcher between the infra view and the Umami traffic view,
 * surfaced as a "Server | Traffic" toggle (instead of a separate bottom-nav
 * tab). ServerView unmounts when Traffic is active, so its polling stops.
 */
export function ServerTab() {
  const { lang } = useLang();
  const t = translations[lang as Lang] ?? translations.en;
  const [view, setView] = useState<"server" | "analytics" | "inbox">("server");
  const inboxCount = usePolled<{ new: number }>("/api/dashboard/inbox/count", 30000);
  const unread = inboxCount?.new ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <Pill size="sm" active={view === "server"} onClick={() => setView("server")}>
          {t.dash.tabs.server}
        </Pill>
        <Pill size="sm" active={view === "analytics"} onClick={() => setView("analytics")}>
          {t.dash.tabs.analytics}
        </Pill>
        <Pill size="sm" active={view === "inbox"} onClick={() => setView("inbox")}>
          {t.dash.tabs.inbox}
          {unread > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-[var(--accent)] text-[var(--background)] text-[10px] font-bold tabular-nums">
              {unread}
            </span>
          )}
        </Pill>
      </div>
      {view === "server" ? <ServerView /> : view === "analytics" ? <AnalyticsTab /> : <InboxTab />}
    </div>
  );
}

function ServerView() {
  const { lang } = useLang();
  const t = translations[lang as Lang] ?? translations.en;

  const current = usePolled<CurrentResponse>("/api/dashboard/server/current", 5000);
  const services = usePolled<{ services: ServiceState[] }>(
    "/api/dashboard/server/services", 10000,
  );
  const domains = usePolled<{ domains: DomainState[] }>(
    "/api/dashboard/server/domains", 15000,
  );
  const history = usePolled<HistoryResponse>(
    "/api/dashboard/server/history?metric=system.cpu_pct,system.mem_used_b&period=1h",
    60000,
  );
  const history24 = usePolled<HistoryResponse>(
    "/api/dashboard/server/history?metric=system.cpu_pct,system.mem_used_b,system.disk_used_b&period=24h",
    60000,
  );

  const memTotal = current?.host?.mem.total_b ?? 1;
  const diskTotal = current?.host?.disk.total ?? 1;

  const cpu24 = history24?.series["system.cpu_pct"] ?? [];
  const mem24 = useMemo(
    () => (history24?.series["system.mem_used_b"] ?? []).map((p) => ({
      t: p.t, v: (p.v / memTotal) * 100,
    })),
    [history24, memTotal],
  );
  const disk24 = useMemo(
    () => (history24?.series["system.disk_used_b"] ?? []).map((p) => ({
      t: p.t, v: (p.v / diskTotal) * 100,
    })),
    [history24, diskTotal],
  );

  if (!current) {
    return (
      <div className="text-center text-[var(--muted)] py-10 text-sm">
        {t.dash.loading}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero — host overview */}
      {current.host && (
        <HostCard host={current.host} history={history} t={t} />
      )}

      {/* Alerts */}
      <AlertsCard alerts={current.alerts} t={t} />

      {/* Ops: backups, updates, fail2ban, ssh, oom, vuln audit */}
      {current.ops && <OpsCard ops={current.ops} t={t} />}

      {/* Trend charts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HistoryChart title={t.dash.server.cpu24h} series={cpu24} unit="%" color="#10b981" />
        <HistoryChart title={t.dash.server.ram24h} series={mem24} unit="%" color="#3b82f6" />
        <HistoryChart title={t.dash.server.disk24h} series={disk24} unit="%" color="#f59e0b" />
      </div>

      {/* Services */}
      <div>
        <SectionHeader
          eyebrow={t.dash.server.services}
          title={`${services?.services.filter((s) => s.active).length ?? 0} / ${services?.services.length ?? 0} ${t.dash.server.active}`}
          trailing={<Server size={14} className="text-[var(--muted)]" />}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {(services?.services ?? []).map((s) => (
            <ServiceCard key={s.unit} s={s} t={t} />
          ))}
        </div>
      </div>

      {/* Domains */}
      <div>
        <SectionHeader
          eyebrow={t.dash.server.domains}
          title={`${domains?.domains.filter((d) => d.ok).length ?? 0} / ${domains?.domains.length ?? 0} ${t.dash.server.healthy}`}
          trailing={<Globe size={14} className="text-[var(--muted)]" />}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {(domains?.domains ?? []).map((d) => (
            <DomainCard key={d.host} d={d} t={t} />
          ))}
        </div>
      </div>

      {/* Database */}
      {current.database && (
        <DatabaseCard db={current.database} pg15={current.ops?.pg15} t={t} />
      )}

      {/* Footer — last update */}
      {current.updated_at && (
        <div className="text-center text-[10px] text-[var(--muted)] pt-2">
          {t.dash.server.updated}: {new Date(current.updated_at).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
