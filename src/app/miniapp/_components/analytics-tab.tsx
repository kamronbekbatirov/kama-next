"use client";

import { useEffect, useState } from "react";
import { Globe, ExternalLink, FileText, MousePointerClick, ArrowUp, ArrowDown, ChevronRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { translations, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/providers";
import { api } from "./_shared";
import { SectionHeader, SoftCard, StatBlock, Pill } from "./dashboard-ui";
import { Sparkline } from "./server-sparkline";

// ---------- Types ----------------------------------------------------------

type Metric = { x: string | null; y: number };

interface StatsBlock {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  comparison?: { pageviews: number; visitors: number; visits: number; bounces: number; totaltime: number };
}

interface DetailResponse {
  configured: boolean;
  ok?: boolean;
  error?: string;
  stats?: StatsBlock;
  series?: { pageviews: Metric[]; sessions: Metric[] };
  pages?: Metric[];
  referrers?: Metric[];
  countries?: Metric[];
  browsers?: Metric[];
}

interface SiteSummary {
  id: string;
  name: string;
  domain: string;
  stats: StatsBlock | null;
  series: Metric[];
}
interface SitesResponse {
  configured: boolean;
  ok?: boolean;
  error?: string;
  sites?: SiteSummary[];
}

type Period = "24h" | "7d" | "30d";
type Labels = typeof translations.en.dash.analytics;

// ---------- Formatters -----------------------------------------------------

const fmtNum = (n: number | undefined | null): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};
const fmtDur = (sec: number): string => {
  if (!sec || sec < 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};
const bouncePct = (s: StatsBlock | null | undefined): number =>
  s && s.visits > 0 ? (s.bounces / s.visits) * 100 : 0;
const delta = (cur: number, prev: number | undefined): number | null => {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
};

const REGION_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
const countryName = (code: string | null): string => {
  if (!code) return "—";
  try { return REGION_NAMES?.of(code.toUpperCase()) ?? code; } catch { return code; }
};

// ---------- Small pieces ---------------------------------------------------

function DeltaChip({ d }: { d: number | null }) {
  if (d == null) return null;
  const up = d >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${up ? "text-emerald-500" : "text-red-500"}`}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(d).toFixed(0)}%
    </span>
  );
}

function BarList({ title, icon, items, empty, format }: {
  title: string; icon: React.ReactNode; items: Metric[]; empty: string;
  format?: (x: string | null) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.y));
  return (
    <SoftCard>
      <SectionHeader eyebrow={title} title="" trailing={<span className="text-[var(--muted)]">{icon}</span>} />
      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted)] py-2">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 8).map((it, i) => (
            <div key={i} className="relative">
              <div className="absolute inset-y-0 left-0 rounded bg-[var(--surface-2)]" style={{ width: `${(it.y / max) * 100}%` }} aria-hidden />
              <div className="relative flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-xs truncate">{format ? format(it.x) : (it.x || "—")}</span>
                <span className="text-xs text-[var(--muted)] tabular-nums shrink-0">{fmtNum(it.y)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SoftCard>
  );
}

// ---------- All-sites overview ---------------------------------------------

function SiteCard({ site, a, onOpen }: { site: SiteSummary; a: Labels; onOpen: () => void }) {
  const s = site.stats;
  const spark = (site.series ?? []).map((p) => p.y);
  return (
    <button type="button" onClick={onOpen} className="text-left w-full">
      <SoftCard className="px-3 py-3 hover:border-[var(--accent)] transition-colors">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-semibold truncate">{site.domain}</span>
          <ChevronRight size={14} className="text-[var(--muted)] shrink-0" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBlock value={fmtNum(s?.visitors)} label={a.visitors} />
          <StatBlock value={fmtNum(s?.pageviews)} label={a.pageviews} />
          <StatBlock value={`${bouncePct(s).toFixed(0)}%`} label={a.bounce} />
        </div>
        {spark.some((v) => v > 0) && (
          <div className="mt-2 text-[var(--accent)]">
            <Sparkline data={spark} width={240} height={22} min={0} />
          </div>
        )}
      </SoftCard>
    </button>
  );
}

function AllSites({ sites, a, onOpen }: { sites: SiteSummary[]; a: Labels; onOpen: (id: string) => void }) {
  const totalVisitors = sites.reduce((n, s) => n + (s.stats?.visitors ?? 0), 0);
  const totalViews = sites.reduce((n, s) => n + (s.stats?.pageviews ?? 0), 0);
  const live = sites.filter((s) => (s.stats?.pageviews ?? 0) > 0).length;
  return (
    <div className="space-y-4">
      <SoftCard>
        <div className="grid grid-cols-3 gap-4">
          <StatBlock value={fmtNum(totalVisitors)} label={a.visitors} hint={a.allSitesHint} />
          <StatBlock value={fmtNum(totalViews)} label={a.pageviews} />
          <StatBlock value={`${live}/${sites.length}`} label={a.active} />
        </div>
      </SoftCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sites.map((s) => (
          <SiteCard key={s.id} site={s} a={a} onOpen={() => onOpen(s.id)} />
        ))}
      </div>
    </div>
  );
}

// ---------- Single-site detail ---------------------------------------------

function SiteDetail({ data, period, a }: { data: DetailResponse | null; period: Period; a: Labels }) {
  if (!data) return <div className="text-center text-[var(--muted)] py-10 text-sm">…</div>;
  if (data.ok === false) {
    return (
      <SoftCard className="border-yellow-500/30">
        <p className="text-xs text-yellow-500">{a.unreachable}</p>
        <p className="text-[10px] text-[var(--muted)] mt-1 break-all">{data.error}</p>
      </SoftCard>
    );
  }
  const s = data.stats;
  const avgTime = s && s.visits > 0 ? s.totaltime / s.visits : 0;
  const noTraffic = !s || s.pageviews === 0;
  const chart = (data.series?.pageviews ?? []).map((p) => ({ t: p.x, views: p.y }));

  return (
    <div className="space-y-4">
      <SoftCard>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <StatBlock value={fmtNum(s?.visitors)} label={a.visitors} hint={a.visitorsHint} />
            <div className="mt-1"><DeltaChip d={delta(s?.visitors ?? 0, s?.comparison?.visitors)} /></div>
          </div>
          <div>
            <StatBlock value={fmtNum(s?.pageviews)} label={a.pageviews} />
            <div className="mt-1"><DeltaChip d={delta(s?.pageviews ?? 0, s?.comparison?.pageviews)} /></div>
          </div>
          <StatBlock value={fmtNum(s?.visits)} label={a.visits} />
          <StatBlock value={`${bouncePct(s).toFixed(0)}%`} label={a.bounce} />
          <StatBlock value={fmtDur(avgTime)} label={a.avgTime} />
        </div>
      </SoftCard>

      {noTraffic && (
        <SoftCard className="border-[var(--card-border)]">
          <p className="text-xs text-[var(--muted)]">{a.noData}</p>
        </SoftCard>
      )}

      {chart.length > 0 && (
        <SoftCard>
          <SectionHeader eyebrow={a.trend} title="" />
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-views" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t" fontSize={9} stroke="currentColor" opacity={0.4}
                  tickFormatter={(v) => {
                    const d = new Date((v as string).replace(" ", "T") + "Z");
                    return period === "24h"
                      ? `${d.getHours().toString().padStart(2, "0")}:00`
                      : `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis fontSize={9} stroke="currentColor" opacity={0.4} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(v) => new Date((v as string).replace(" ", "T") + "Z").toLocaleString()}
                  contentStyle={{ fontSize: 11, backgroundColor: "var(--card)", border: "1px solid var(--card-border)" }}
                />
                <Area type="monotone" dataKey="views" name={a.pageviews} stroke="#10b981" strokeWidth={1.5} fill="url(#g-views)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SoftCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BarList title={a.topPages} icon={<FileText size={14} />} items={data.pages ?? []} empty={a.empty} />
        <BarList title={a.referrers} icon={<ExternalLink size={14} />} items={data.referrers ?? []} empty={a.directOnly} format={(x) => x || a.direct} />
        <BarList title={a.countries} icon={<Globe size={14} />} items={data.countries ?? []} empty={a.empty} format={countryName} />
        <BarList title={a.browsers} icon={<MousePointerClick size={14} />} items={data.browsers ?? []} empty={a.empty} format={(x) => (x ? x[0].toUpperCase() + x.slice(1) : "—")} />
      </div>
    </div>
  );
}

// ---------- Main -----------------------------------------------------------

function usePolled<T>(url: string | null, intervalMs: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) { setData(null); return; }
    let cancelled = false;
    const fetchOnce = async () => {
      try { const r = await api(url); if (!cancelled) setData(r as T); } catch { /* keep prev */ }
    };
    setData(null);
    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [url, intervalMs]);
  return data;
}

export function AnalyticsTab() {
  const { lang } = useLang();
  const t = translations[lang as Lang] ?? translations.en;
  const a = t.dash.analytics;

  const [period, setPeriod] = useState<Period>("24h");
  const [selected, setSelected] = useState<string>("all"); // "all" | website id

  const sites = usePolled<SitesResponse>(`/api/dashboard/analytics/sites?period=${period}`, 60000);
  const detail = usePolled<DetailResponse>(
    selected === "all" ? null : `/api/dashboard/analytics?period=${period}&website=${selected}`,
    60000,
  );

  const periods: Period[] = ["24h", "7d", "30d"];
  const header = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow={a.title} title={a.overview} className="mb-0" />
        <div className="flex gap-1.5">
          {periods.map((p) => (
            <Pill key={p} size="sm" active={period === p} onClick={() => setPeriod(p)}>{a.periods[p]}</Pill>
          ))}
        </div>
      </div>
      {sites?.sites && sites.sites.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <Pill size="sm" active={selected === "all"} onClick={() => setSelected("all")}>{a.allPill}</Pill>
          {sites.sites.map((s) => (
            <Pill key={s.id} size="sm" active={selected === s.id} onClick={() => setSelected(s.id)}>{s.domain}</Pill>
          ))}
        </div>
      )}
    </div>
  );

  if (!sites) {
    return <div className="text-center text-[var(--muted)] py-10 text-sm">{t.dash.loading}</div>;
  }
  if (sites.configured === false) {
    return (
      <SoftCard className="border-yellow-500/30">
        <SectionHeader eyebrow={a.title} title={a.notConfigured} />
        <p className="text-xs text-[var(--muted)]">{a.notConfiguredHint}</p>
      </SoftCard>
    );
  }
  if (sites.ok === false) {
    return (
      <div className="space-y-4">
        {header}
        <SoftCard className="border-yellow-500/30">
          <p className="text-xs text-yellow-500">{a.unreachable}</p>
          <p className="text-[10px] text-[var(--muted)] mt-1 break-all">{sites.error}</p>
        </SoftCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {selected === "all"
        ? <AllSites sites={sites.sites ?? []} a={a} onOpen={(id) => setSelected(id)} />
        : <SiteDetail data={detail} period={period} a={a} />}
      <div className="text-center text-[10px] text-[var(--muted)] pt-1">{a.poweredBy}</div>
    </div>
  );
}
