"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock3,
  Download,
  Filter,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  ChartCard,
  ChartSkeleton,
  DataList,
  DataTable,
  DetailDrawer,
  FilterBar,
  FilterBottomSheet,
  InsightSkeleton,
  InsightsAccordion,
  ListSkeleton,
  MobileHeader,
  SortSelect,
  SourceSplit,
  StatCard,
  StatSkeletonRow,
  StockLineChart,
  TableSkeleton,
  TrendLine,
} from "@/components/analytics";
import type { TrackingPageStat, TrackingSummary } from "@/lib/types";

type RangeKey = "7" | "30" | "90" | "custom";
type SortKey = "views" | "ctr" | "duration" | "clicks" | "unique";

type DetailState =
  | {
      type: "summary";
      title: string;
      subtitle?: string;
      metrics: { label: string; value: string }[];
    }
  | {
      type: "page";
      page: TrackingPageStat;
    }
  | {
      type: "chart";
      title: string;
      subtitle?: string;
      metrics: { label: string; value: string }[];
    };

export default function TrackingPage() {
  const { authorizedRequest } = useAuth();
  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [pathQuery, setPathQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailState, setDetailState] = useState<DetailState | null>(null);

  const sourceTotals = useMemo(() => {
    const series = trackingSummary?.timeseries ?? [];
    return series.reduce(
      (acc, point) => {
        acc.organic += point.organic;
        acc.direct += point.direct;
        acc.total += point.views;
        return acc;
      },
      { organic: 0, direct: 0, total: 0 },
    );
  }, [trackingSummary]);

  const loadTracking = useCallback(
    async (options?: { days?: number; from?: string; to?: string; signal?: AbortSignal }) => {
      setTrackingLoading(true);
      setTrackingError(null);
      try {
        const params = new URLSearchParams();
        if (options?.from) params.set("from", options.from);
        if (options?.to) params.set("to", options.to);
        if (!options?.from && !options?.to) {
          params.set("days", String(options?.days ?? 7));
        }
        const data = await authorizedRequest<TrackingSummary>(`/tracking/summary?${params.toString()}`, {
          signal: options?.signal,
        });
        setTrackingSummary(data ?? null);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setTrackingError(err instanceof Error ? err.message : "Tracking konnte nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setTrackingLoading(false);
        }
      }
    },
    [authorizedRequest],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTracking({ days: 7, signal: controller.signal });
    return () => controller.abort();
  }, [loadTracking]);

  const filteredPages = useMemo(() => {
    if (!trackingSummary?.pages) return [];
    const query = pathQuery.trim().toLowerCase();
    let pages = trackingSummary.pages;
    if (query) {
      pages = pages.filter((page) => page.path.toLowerCase().includes(query));
    }
    const sorters: Record<SortKey, (page: TrackingPageStat) => number> = {
      views: (p) => p.views,
      ctr: (p) => p.clickRate,
      duration: (p) => p.avgDurationMs,
      clicks: (p) => p.clicks,
      unique: (p) => p.uniqueVisitors,
    };
    const selector = sorters[sortKey];
    const sorted = [...pages].sort((a, b) => {
      const delta = selector(a) - selector(b);
      return sortDir === "desc" ? -delta : delta;
    });
    return sorted;
  }, [pathQuery, sortDir, sortKey, trackingSummary?.pages]);

  const insights = useMemo(() => {
    if (!trackingSummary?.pages?.length) return [];
    const pages = trackingSummary.pages;
    const minViews = 5;
    const byCtr = [...pages].filter((p) => p.views >= minViews).sort((a, b) => b.clickRate - a.clickRate);
    const byDuration = [...pages]
      .filter((p) => p.views >= minViews)
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
    const topCtr = byCtr[0];
    const topDuration = byDuration[0];
    return [
      topCtr && `Beste CTR: ${formatPercent(topCtr.clickRate)} auf ${topCtr.path}`,
      topDuration && `Längste Verweildauer: ${formatDuration(topDuration.avgDurationMs)} auf ${topDuration.path}`,
      `Organisch-Anteil: ${formatPercent(trackingSummary.totals.organicShare)} im Zeitraum`,
    ].filter(Boolean) as string[];
  }, [trackingSummary]);

  const trends = useMemo(() => {
    const series = trackingSummary?.timeseries ?? [];
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const delta = (current: number, prev: number) => ({
      value: current - prev,
      pct: prev ? (current - prev) / prev : current ? 1 : 0,
    });
    return {
      views: delta(last.views, first.views),
      clicks: delta(last.clicks, first.clicks),
      organic: delta(last.organic, first.organic),
    };
  }, [trackingSummary]);

  const rateTrends = useMemo(() => {
    const series = trackingSummary?.timeseries ?? [];
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const safeRate = (num: number, denom: number) => (denom ? num / denom : 0);
    return {
      ctrDelta: safeRate(last.clicks, last.views) - safeRate(first.clicks, first.views),
      organicShareDelta: safeRate(last.organic, last.views) - safeRate(first.organic, first.views),
    };
  }, [trackingSummary]);

  const visitorStats = useMemo(() => {
    const series = trackingSummary?.timeseries ?? [];
    if (!series.length) return { active: 0, lastHour: 0, today: 0 };
    const lastPoint = series[series.length - 1];
    const lastDate = new Date(lastPoint.date);
    const oneHourAgo = new Date(lastDate.getTime() - 60 * 60 * 1000);
    const startOfDay = new Date(lastDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const lastHour = series.reduce((sum, point) => {
      const pointDate = new Date(point.date);
      return pointDate > oneHourAgo && pointDate <= lastDate ? sum + point.uniqueVisitors : sum;
    }, 0);
    const today = series.reduce((sum, point) => {
      const pointDate = new Date(point.date);
      return pointDate >= startOfDay && pointDate < endOfDay ? sum + point.uniqueVisitors : sum;
    }, 0);
    return { active: lastPoint.uniqueVisitors, lastHour, today };
  }, [trackingSummary]);

  const applyRangeSelection = (key: RangeKey) => {
    setRangeKey(key);
    if (key === "7") {
      void loadTracking({ days: 7 });
    } else if (key === "30") {
      void loadTracking({ days: 30 });
    } else if (key === "90") {
      void loadTracking({ days: 90 });
    }
  };

  const refresh = () => {
    if (rangeKey === "custom" && customFrom && customTo) {
      void loadTracking({ from: customFrom, to: customTo });
    } else if (rangeKey === "90") {
      void loadTracking({ days: 90 });
    } else if (rangeKey === "30") {
      void loadTracking({ days: 30 });
    } else {
      void loadTracking({ days: 7 });
    }
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    setRangeKey("custom");
    void loadTracking({ from: customFrom, to: customTo });
  };

  const resetFilters = () => {
    setPathQuery("");
    setCustomFrom("");
    setCustomTo("");
    setRangeKey("7");
    void loadTracking({ days: 7 });
  };

  const makeTrend = (pct?: number) => {
    if (pct === undefined || Number.isNaN(pct)) return undefined;
    const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    return { direction: direction as "up" | "down" | "flat", label: formatPercent(Math.abs(pct)) };
  };

  const rangeChip = useMemo(() => {
    if (rangeKey === "custom" && customFrom && customTo) {
      return `Zeitraum: ${formatDate(customFrom)} – ${formatDate(customTo)}`;
    }
    if (rangeKey === "custom") {
      return "Zeitraum: Custom";
    }
    return `Zeitraum: Letzte ${rangeKey} Tage`;
  }, [customFrom, customTo, rangeKey]);

  const filterChips = useMemo(() => {
    const chips = [rangeChip];
    if (pathQuery.trim()) {
      chips.push(`Pfad: ${pathQuery.trim()}`);
    }
    return chips;
  }, [pathQuery, rangeChip]);

  const initialLoading = trackingLoading && !trackingSummary;

  const openSummaryDetail = (title: string, metrics: { label: string; value: string }[], subtitle?: string) => {
    setDetailState({ type: "summary", title, subtitle, metrics });
  };

  const openChartDetail = (title: string, metrics: { label: string; value: string }[], subtitle?: string) => {
    setDetailState({ type: "chart", title, subtitle, metrics });
  };

  return (
    <section className="space-y-6">
      <MobileHeader
        eyebrow="Workspace"
        title="Tracking Analytics"
        description="Pageviews, CTR, Verweildauer und Traffic-Mix auf einen Blick."
        chips={filterChips}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={refresh}
              aria-label="Tracking neu laden"
            >
              {trackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={() => exportPagesCsv(filteredPages)}
              aria-label="CSV exportieren"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              className="h-11 md:hidden"
              onClick={() => setFilterOpen(true)}
            >
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </>
        }
      >
        <div className="hidden md:block">
          <FilterBar
            rangeKey={rangeKey}
            onSelectRange={applyRangeSelection}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            onApplyCustom={applyCustomRange}
            pathQuery={pathQuery}
            onPathChange={setPathQuery}
          />
        </div>
      </MobileHeader>

      {initialLoading ? (
        <StatSkeletonRow />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:snap-none lg:grid-cols-4">
          <StatCard
            icon={BarChart3}
            label="Pageviews / Besucher"
            value={`${formatNumber(trackingSummary?.totals.views ?? 0)} / ${formatNumber(trackingSummary?.totals.uniqueVisitors ?? 0)}`}
            hint="Views / eindeutige Sessions"
            trend={makeTrend(trends?.views.pct)}
            onClick={() =>
              openSummaryDetail(
                "Pageviews & Besucher",
                [
                  { label: "Pageviews", value: formatNumber(trackingSummary?.totals.views ?? 0) },
                  { label: "Unique Visitors", value: formatNumber(trackingSummary?.totals.uniqueVisitors ?? 0) },
                  { label: "Klicks", value: formatNumber(trackingSummary?.totals.clicks ?? 0) },
                  {
                    label: "CTR",
                    value: formatPercent(
                      (trackingSummary?.totals.clicks ?? 0) / Math.max(trackingSummary?.totals.views ?? 1, 1),
                    ),
                  },
                ],
                rangeChip,
              )
            }
            className="min-w-[260px] snap-start sm:min-w-0"
          />
          <StatCard
            icon={MousePointerClick}
            label="Klickrate"
            value={formatPercent((trackingSummary?.totals.clicks ?? 0) / Math.max(trackingSummary?.totals.views ?? 1, 1))}
            hint={`${formatNumber(trackingSummary?.totals.clicks ?? 0)} Klicks`}
            trend={makeTrend(rateTrends?.ctrDelta)}
            onClick={() =>
              openSummaryDetail(
                "Klickrate",
                [
                  {
                    label: "CTR",
                    value: formatPercent(
                      (trackingSummary?.totals.clicks ?? 0) / Math.max(trackingSummary?.totals.views ?? 1, 1),
                    ),
                  },
                  { label: "Klicks", value: formatNumber(trackingSummary?.totals.clicks ?? 0) },
                  { label: "Pageviews", value: formatNumber(trackingSummary?.totals.views ?? 0) },
                ],
                rangeChip,
              )
            }
            className="min-w-[260px] snap-start sm:min-w-0"
          />
          <StatCard
            icon={Clock3}
            label="Ø Verweildauer"
            value={formatDuration(trackingSummary?.totals.avgDurationMs ?? 0)}
            hint="Über alle Seiten"
            onClick={() =>
              openSummaryDetail(
                "Ø Verweildauer",
                [
                  { label: "Ø Verweildauer", value: formatDuration(trackingSummary?.totals.avgDurationMs ?? 0) },
                  { label: "Pageviews", value: formatNumber(trackingSummary?.totals.views ?? 0) },
                  { label: "Unique Visitors", value: formatNumber(trackingSummary?.totals.uniqueVisitors ?? 0) },
                ],
                rangeChip,
              )
            }
            className="min-w-[260px] snap-start sm:min-w-0"
          />
          <StatCard
            icon={Sparkles}
            label="Organisch-Anteil"
            value={formatPercent(trackingSummary?.totals.organicShare ?? 0)}
            hint="vs. Direkt/Referrals"
            trend={makeTrend(rateTrends?.organicShareDelta)}
            onClick={() =>
              openSummaryDetail(
                "Organisch-Anteil",
                [
                  { label: "Organisch-Anteil", value: formatPercent(trackingSummary?.totals.organicShare ?? 0) },
                  { label: "Organische Views", value: formatNumber(sourceTotals.organic) },
                  { label: "Direkt/Referrals", value: formatNumber(sourceTotals.direct) },
                ],
                rangeChip,
              )
            }
            className="min-w-[260px] snap-start sm:min-w-0"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <ChartCard
            title="Traffic Verlauf"
            subtitle="Pageviews (solid) und organisch (dashed)."
            action={
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-400">
                <Filter className="h-4 w-4" />
                <span className="min-w-0 break-words">
                  {trackingSummary
                    ? `${formatDate(trackingSummary.since)} – ${formatDate(trackingSummary.until)}`
                    : "Zeitraum"}
                </span>
                <Button
                  variant="ghost"
                  size="md"
                  className="h-11 rounded-full border border-white/10 bg-white/5 text-[11px]"
                  onClick={() =>
                    openChartDetail(
                      "Traffic Verlauf",
                      [
                        { label: "Pageviews", value: formatNumber(trackingSummary?.totals.views ?? 0) },
                        { label: "Klicks", value: formatNumber(trackingSummary?.totals.clicks ?? 0) },
                        { label: "Unique Visitors", value: formatNumber(trackingSummary?.totals.uniqueVisitors ?? 0) },
                        { label: "Organisch", value: formatNumber(sourceTotals.organic) },
                      ],
                      rangeChip,
                    )
                  }
                >
                  Details
                </Button>
              </div>
            }
          >
            {trackingError && <p className="text-xs text-rose-300">{trackingError}</p>}
            {initialLoading ? (
              <ChartSkeleton />
            ) : trackingSummary ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-3">
                  <StockLineChart
                    data={trackingSummary.timeseries}
                    formatNumber={formatNumber}
                    formatDate={formatDate}
                  />
                  <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Views</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Organisch</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-200">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-emerald-200">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </span>
                    Live
                  </div>
                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Aktive Besucher</p>
                    <p className="mt-2 text-3xl font-semibold text-white tabular-nums">{formatNumber(visitorStats.active)}</p>
                    <p className="text-xs text-slate-400">Letzter Zeitraumspunkt</p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>Besucher letzte Stunde</span>
                        <span className="font-semibold text-slate-100">{formatNumber(visitorStats.lastHour)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Besucher diesen Tag</span>
                        <span className="font-semibold text-slate-100">{formatNumber(visitorStats.today)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-slate-400">
                <p>Keine Daten für den gewählten Zeitraum.</p>
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={resetFilters}
                >
                  Filter zurücksetzen
                </Button>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="min-w-0 lg:col-span-4">
          <ChartCard title="Insights" subtitle="Schnelle Auffälligkeiten">
            {initialLoading ? <InsightSkeleton /> : <InsightsAccordion items={insights} />}
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Traffic-Mix" subtitle="Organisch vs. Direkt/Referrals">
          {initialLoading ? (
            <ChartSkeleton />
          ) : (
            <SourceSplit
              organic={sourceTotals.organic}
              direct={sourceTotals.direct}
              total={sourceTotals.total}
              formatNumber={formatNumber}
            />
          )}
        </ChartCard>

        <ChartCard title="Trends & Veränderungen" subtitle="Start → Ende des Zeitraums">
          {initialLoading ? (
            <InsightSkeleton />
          ) : trends ? (
            <div className="space-y-2 text-sm text-slate-200">
              <TrendLine label="Pageviews" change={trends.views} />
              <TrendLine label="Klicks" change={trends.clicks} />
              <TrendLine label="Organisch" change={trends.organic} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Zu wenige Punkte für Trends.</p>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Seiten-Performance"
        subtitle="Sortiere nach Views, CTR oder Verweildauer."
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span>Sortieren nach</span>
            <SortSelect
              sortKey={sortKey}
              sortDir={sortDir}
              onChange={setSortKey}
              onToggleDir={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            />
            <Button
              size="md"
              variant="ghost"
              className="h-11 rounded-full border border-white/10 bg-white/5 text-[11px]"
              onClick={() => exportPagesCsv(filteredPages)}
            >
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
          </div>
        }
      >
        {initialLoading ? (
          <>
            <div className="md:hidden">
              <ListSkeleton />
            </div>
            <div className="hidden md:block">
              <TableSkeleton />
            </div>
          </>
        ) : (
          <>
            <div className="md:hidden">
              <DataList
                pages={filteredPages}
                onSelect={(page) => setDetailState({ type: "page", page })}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
                formatDuration={formatDuration}
                onReset={resetFilters}
              />
            </div>
            <div className="hidden md:block">
              <DataTable
                pages={filteredPages}
                onSelect={(page) => setDetailState({ type: "page", page })}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
                formatDuration={formatDuration}
                onReset={resetFilters}
              />
            </div>
          </>
        )}
      </ChartCard>

      <FilterBottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        rangeKey={rangeKey}
        onSelectRange={applyRangeSelection}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        pathQuery={pathQuery}
        onPathChange={setPathQuery}
        onApply={refresh}
        onReset={resetFilters}
      />

      <DetailDrawer
        open={detailState !== null}
        title={
          detailState?.type === "page"
            ? detailState.page.path
            : detailState?.title ?? "Details"
        }
        subtitle={detailState?.type === "page" ? rangeChip : detailState?.subtitle}
        onClose={() => setDetailState(null)}
      >
        {detailState?.type === "page" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailMetric label="Views" value={formatNumber(detailState.page.views)} />
              <DetailMetric label="Unique" value={formatNumber(detailState.page.uniqueVisitors)} />
              <DetailMetric label="CTR" value={formatPercent(detailState.page.clickRate)} />
              <DetailMetric label="Klicks" value={formatNumber(detailState.page.clicks)} />
              <DetailMetric label="Ø Zeit" value={formatDuration(detailState.page.avgDurationMs)} />
              <DetailMetric label="Organisch" value={formatNumber(detailState.page.organicViews)} />
              <DetailMetric label="Direkt" value={formatNumber(detailState.page.directViews)} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
              Zeitreihe pro Seite: —
              {/* TODO: Page-spezifische Zeitreihen-Events ergänzen. */}
            </div>
          </div>
        ) : detailState?.type ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {detailState.metrics.map((metric) => (
              <DetailMetric key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        ) : null}
      </DetailDrawer>
    </section>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function exportPagesCsv(pages: TrackingPageStat[]) {
  if (typeof window === "undefined" || pages.length === 0) return;
  const header = [
    "path",
    "views",
    "uniqueVisitors",
    "clicks",
    "clickRate",
    "avgDurationMs",
    "organicViews",
    "directViews",
  ];
  const rows = pages.map((p) =>
    [
      p.path,
      p.views,
      p.uniqueVisitors,
      p.clicks,
      p.clickRate.toFixed(4),
      p.avgDurationMs,
      p.organicViews,
      p.directViews,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tracking-pages.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function formatNumber(value: number) {
  return value.toLocaleString("de-DE");
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatDuration(durationMs: number) {
  if (!durationMs || Number.isNaN(durationMs)) return "0s";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
