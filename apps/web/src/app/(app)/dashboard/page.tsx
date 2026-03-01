"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Globe2, Loader2, Mail, MousePointerClick, RefreshCw, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CustomerMessage,
  TrackingPageStat,
  TrackingSummary,
  TrackingTimeseriesPoint,
} from "@/lib/types";

export default function DashboardPage() {
  const { user, authorizedRequest } = useAuth();
  const router = useRouter();
  const displayName = useMemo(() => {
    if (!user) return "";
    return user.firstName?.trim() || user.email || "";
  }, [user]);
  const [greeting, setGreeting] = useState("Guten Tag");

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return setGreeting("Guten Morgen");
      if (hour < 18) return setGreeting("Guten Tag");
      return setGreeting("Guten Abend");
    };

    updateGreeting();
    const intervalId = window.setInterval(updateGreeting, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const [recentMessages, setRecentMessages] = useState<CustomerMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<"7" | "30" | "custom">("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoadingMessages(true);
    setMessageError(null);
    authorizedRequest<CustomerMessage[]>("/messages/unassigned?limit=20", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setRecentMessages(data ?? []);
      })
      .catch((err) => {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setMessageError(err instanceof Error ? err.message : "Nachrichten konnten nicht geladen werden.");
      })
      .finally(() => active && setLoadingMessages(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest]);

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

  const handleOpenMessage = (id: string) => {
    router.push(`/workspace/messages?unassigned=${encodeURIComponent(id)}`);
  };

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

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{greeting}</p>
        <h1 className="text-xl font-semibold text-white sm:text-3xl">
          Willkommen zurück{displayName ? `, ${displayName}` : ""}
        </h1>
        <p className="text-sm text-slate-400">
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Tracking & Traffic"
          description="Eigene Events statt GA: Pageviews, Klicks, Verweildauer."
          className="overflow-x-hidden"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
                <RangeChip
                  label="7T"
                  active={rangeKey === "7"}
                  onClick={() => {
                    setRangeKey("7");
                    void loadTracking({ days: 7 });
                  }}
                />
                <RangeChip
                  label="30T"
                  active={rangeKey === "30"}
                  onClick={() => {
                    setRangeKey("30");
                    void loadTracking({ days: 30 });
                  }}
                />
                <RangeChip
                  label="Custom"
                  active={rangeKey === "custom"}
                  onClick={() => setRangeKey("custom")}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full border border-white/10 bg-white/5"
                onClick={() => {
                  if (rangeKey === "custom" && customFrom && customTo) {
                    void loadTracking({ from: customFrom, to: customTo });
                  } else if (rangeKey === "30") {
                    void loadTracking({ days: 30 });
                  } else {
                    void loadTracking({ days: 7 });
                  }
                }}
              >
                {trackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          }
        >
          {trackingError && <p className="text-xs text-rose-300">{trackingError}</p>}
          {trackingLoading && !trackingSummary ? (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade Tracking...
            </p>
          ) : null}
          {trackingSummary ? (
            <div className="space-y-5">
              {rangeKey === "custom" && (
                <div className="flex flex-wrap items-start justify-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start">
                    <label className="flex flex-col gap-1 text-slate-300">
                      Von
                      <Input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="w-full rounded-full bg-slate-900/60 sm:w-36"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-slate-300">
                      Bis
                      <Input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="w-full rounded-full bg-slate-900/60 sm:w-36"
                      />
                    </label>
                  </div>
                  <div className="flex w-full flex-col items-start gap-1 sm:w-auto sm:items-end">
                    <Button
                      size="sm"
                      className="rounded-full px-3"
                      disabled={!customFrom || !customTo}
                      onClick={() => {
                        if (!customFrom || !customTo) return;
                        void loadTracking({ from: customFrom, to: customTo });
                      }}
                    >
                      Anwenden
                    </Button>
                    <p className="text-[11px] text-slate-400">Max. 90 Tage.</p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <MetricTile
                  icon={TrendingUp}
                  label="Pageviews"
                  value={formatNumber(trackingSummary.totals.views)}
                  hint={`${formatNumber(trackingSummary.totals.uniqueVisitors)} Besucher`}
                />
                <MetricTile
                  icon={MousePointerClick}
                  label="Klickrate"
                  value={formatPercent(trackingSummary.totals.clicks / Math.max(trackingSummary.totals.views, 1))}
                  hint={`${formatNumber(trackingSummary.totals.clicks)} Klicks`}
                />
                <MetricTile
                  icon={Clock3}
                  label="Ø Verweildauer"
                  value={formatDuration(trackingSummary.totals.avgDurationMs)}
                  hint="Über alle Seiten"
                />
                <MetricTile
                  icon={Globe2}
                  label="Organisch"
                  value={formatPercent(trackingSummary.totals.organicShare)}
                  hint="vs. Direkt/Referrals"
                />
              </div>

              <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/10 via-white/5 to-transparent p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{formatDate(trackingSummary.since)}</span>
                  <span>{formatDate(trackingSummary.until)}</span>
                </div>
                <div className="mt-3 flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-stretch 2xl:gap-0">
                  <div className="order-1 2xl:order-2 2xl:w-52">
                    <div className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-200">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-emerald-200">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        </span>
                        Live
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Aktive Besucher</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(visitorStats.active)}</p>
                        <p className="text-[11px] text-slate-400">Letzter Zeitraumspunkt</p>
                        <div className="mt-3 grid gap-2 text-[11px] text-slate-300">
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
                  <div className="order-2 min-w-0 2xl:order-1 2xl:flex-1">
                    <StockLineChart data={trackingSummary.timeseries} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 2xl:grid-cols-[1.3fr_1fr]">
                <TopPagesList pages={trackingSummary.pages} />
                <SourceSplit organic={sourceTotals.organic} direct={sourceTotals.direct} total={sourceTotals.total} />
              </div>
            </div>
          ) : !trackingLoading ? (
            <p className="text-sm text-slate-400">Noch keine Events gesendet. Das Tracking läuft automatisch auf allen Seiten.</p>
          ) : null}
        </Card>

        <Card
          title="Letzte E-Mails"
          description="Neueste unzugeordnete Nachrichten. Klicke zum Öffnen in Messages."
        >
          {loadingMessages && (
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Nachrichten werden geladen...
            </p>
          )}
          {messageError && <p className="text-xs text-rose-300">{messageError}</p>}
          {!loadingMessages && recentMessages.length === 0 && (
            <p className="text-sm text-slate-400">Keine neuen Nachrichten.</p>
          )}
        <div className="mt-2 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
            {recentMessages.map((message) => {
              const categoryMeta = getCategoryMeta(message.category);
              const timestamp =
                message.receivedAt || message.sentAt || message.createdAt
                  ? new Date(message.receivedAt ?? message.sentAt ?? message.createdAt).toLocaleString("de-DE")
                  : "";
              const subject = message.subject || "Ohne Betreff";
              return (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => handleOpenMessage(message.id)}
                  className="group relative w-full text-left rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/[0.04] to-slate-900/40 px-4 py-3 shadow-[0_10px_28px_rgba(8,15,35,0.35)] transition hover:-translate-y-[1px] hover:border-white/20 hover:shadow-[0_14px_34px_rgba(8,15,35,0.45)]"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-200 transition group-hover:bg-white/15">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-sm font-semibold text-white sm:truncate">
                            {subject}
                          </span>
                          {categoryMeta ? (
                            <span
                              className={clsx(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                                categoryMeta.className,
                              )}
                            >
                              {categoryMeta.label}
                            </span>
                          ) : null}
                        </div>
                        <p className="break-words text-xs text-slate-400 sm:truncate">
                          {message.fromEmail ?? "Unbekannter Absender"}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums sm:text-right sm:whitespace-nowrap">
                      {timestamp}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[70ch] line-clamp-2 text-sm text-slate-200/90">{message.preview ?? message.body}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <Button size="sm" variant="ghost" onClick={() => router.push("/workspace/messages")}>
              Alle Nachrichten öffnen
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{label}</p>
          <p className="text-lg font-semibold text-white leading-tight">{value}</p>
          {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

function StockLineChart({ data }: { data: TrackingTimeseriesPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const updateWidth = () => {
      const nextWidth = Math.floor(node.getBoundingClientRect().width);
      if (nextWidth > 0) {
        setContainerWidth(nextWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!data.length) {
    return (
      <div ref={containerRef} className="w-full overflow-hidden">
        <p className="text-sm text-slate-400">Keine Daten für den Zeitraum.</p>
      </div>
    );
  }

  const width = containerWidth > 0 ? containerWidth : 640;
  const height = width < 380 ? 280 : width < 520 ? 260 : 220;
  const margin = {
    top: 12,
    right: 12,
    bottom: width < 420 ? 40 : 32,
    left: width < 360 ? 34 : 44,
  };
  const maxValue = Math.max(...data.map((point) => Math.max(point.views, point.organic, point.direct)), 1);
  const tickCount = 4;
  const rawStep = maxValue / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.max(1, Math.ceil(rawStep / magnitude) * magnitude);
  const scaledMax = niceStep * tickCount;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const points = data.map((point, index) => {
    const x = margin.left + index * step;
    const yViews = margin.top + plotHeight - (point.views / scaledMax) * plotHeight;
    const yOrganic = margin.top + plotHeight - (point.organic / scaledMax) * plotHeight;
    return { x, yViews, yOrganic, value: point.views, label: point.date };
  });

  const axisY = margin.top + plotHeight;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = index * niceStep;
    const y = margin.top + plotHeight - (value / scaledMax) * plotHeight;
    return { value, y };
  });

  const labelCount = width < 420 ? Math.min(3, data.length) : Math.min(5, data.length);
  const labelStep = labelCount > 1 ? Math.round((data.length - 1) / (labelCount - 1)) : 1;
  const labelIndices = Array.from(
    new Set(Array.from({ length: labelCount }, (_, index) => Math.min(data.length - 1, index * labelStep))),
  ).sort((a, b) => a - b);

  const viewPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.yViews.toFixed(1)}`).join(" ");
  const organicPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.yOrganic.toFixed(1)}`).join(" ");

  const areaPath = [
    `M ${points[0].x.toFixed(1)} ${axisY}`,
    ...points.map((point) => `L ${point.x.toFixed(1)} ${point.yViews.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${axisY}`,
    "Z",
  ].join(" ");

  const lastPoint = points[points.length - 1];

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Traffic Verlauf"
        preserveAspectRatio="xMidYMid meet"
        className="w-full max-w-full"
        style={{ height: `${height}px`, overflow: "hidden", display: "block" }}
      >
      <defs>
        <linearGradient id="trafficArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(14,165,233,0.35)" />
          <stop offset="100%" stopColor="rgba(14,165,233,0.02)" />
        </linearGradient>
      </defs>
      {yTicks.map((tick) => (
        <g key={`y-${tick.value}`}>
          <line
            x1={margin.left}
            y1={tick.y}
            x2={width - margin.right}
            y2={tick.y}
            stroke="rgba(148,163,184,0.18)"
            strokeDasharray="4 6"
          />
            <text
              x={margin.left - 8}
              y={tick.y}
              fill="rgba(148,163,184,0.7)"
              fontSize={width < 360 ? 9 : 10}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatNumber(tick.value)}
            </text>
          </g>
        ))}
      <line x1={margin.left} y1={axisY} x2={width - margin.right} y2={axisY} stroke="rgba(148,163,184,0.35)" />
      <path d={areaPath} fill="url(#trafficArea)" />
      <path d={viewPath} fill="none" stroke="rgba(56,189,248,0.8)" strokeWidth={2.5} strokeLinecap="round" />
      <path
        d={organicPath}
        fill="none"
        stroke="rgba(52,211,153,0.9)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="6 4"
      />
      <circle cx={lastPoint.x} cy={lastPoint.yViews} r={4} fill="#0ea5e9" stroke="white" strokeWidth={2} />
      {labelIndices.map((index) => {
        const point = points[index];
        return (
          <g key={`x-${point.label}-${index}`}>
            <line x1={point.x} y1={axisY} x2={point.x} y2={axisY + 4} stroke="rgba(148,163,184,0.45)" />
            <text
              x={point.x}
              y={axisY + 18}
              fill="rgba(148,163,184,0.7)"
              fontSize={width < 360 ? 9 : 10}
              textAnchor="middle"
            >
              {formatDate(point.label)}
            </text>
          </g>
        );
      })}
      </svg>
    </div>
  );
}

function TopPagesList({ pages }: { pages: TrackingPageStat[] }) {
  const top = pages.slice(0, 2);
  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
        Noch keine Seitenaufrufe in diesem Zeitraum.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Top Seiten</p>
      <div className="mt-3 space-y-3">
        {top.map((page) => (
          <div
            key={page.path}
            className="grid gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 sm:grid-cols-[3fr_2fr] sm:items-center sm:gap-3"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-white sm:truncate">{page.path}</p>
              <p className="text-[11px] text-slate-400">
                CTR {formatPercent(page.clickRate)} • Ø {formatDuration(page.avgDurationMs)}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-semibold text-white">{formatNumber(page.views)}</p>
              <p className="text-[11px] text-slate-400">{formatNumber(page.uniqueVisitors)} Besucher</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceSplit({ organic, direct, total }: { organic: number; direct: number; total: number }) {
  const safeTotal = Math.max(total, organic + direct, 0);
  const baseTotal = safeTotal || 0;
  const organicPercent = baseTotal ? Math.min(100, Math.max(0, (organic / baseTotal) * 100)) : 0;
  const directPercent = baseTotal ? Math.min(100, Math.max(0, (direct / baseTotal) * 100)) : 0;
  const otherCount = Math.max(0, baseTotal - organic - direct);
  const otherPercent = baseTotal ? Math.max(0, 100 - organicPercent - directPercent) : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Traffic-Mix</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div className="flex h-full">
          <span style={{ width: `${organicPercent}%` }} className="h-full bg-emerald-500/70" />
          <span style={{ width: `${directPercent}%` }} className="h-full bg-sky-500/70" />
          <span style={{ width: `${otherPercent}%` }} className="h-full bg-slate-500/50" />
        </div>
      </div>
      <div className="mt-3 space-y-2 text-xs text-slate-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Organisch</span>
          </div>
          <span>{formatNumber(organic)} Aufrufe</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>Direkt</span>
          </div>
          <span>{formatNumber(direct)} Aufrufe</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span>Referrals/sonstiges</span>
          </div>
          <span>{formatNumber(otherCount)} Aufrufe</span>
        </div>
      </div>
    </div>
  );
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

function getCategoryMeta(category?: CustomerMessage["category"]) {
  switch (category) {
    case "KUENDIGUNG":
      return { label: "Kündigung", className: "bg-rose-500/20 text-rose-200" };
    case "KRITISCH":
      return { label: "Kritisch", className: "bg-red-500/25 text-red-100" };
    case "KOSTENVORANSCHLAG":
      return { label: "Kostenvoranschlag", className: "bg-indigo-500/20 text-indigo-100" };
    case "ANGEBOT":
      return { label: "Angebot", className: "bg-sky-500/20 text-sky-100" };
    case "WERBUNG":
      return { label: "Werbung", className: "bg-amber-500/20 text-amber-100" };
    default:
      return null;
  }
}

function RangeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-lg px-2 py-1",
        active ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10",
      )}
    >
      {label}
    </button>
  );
}
