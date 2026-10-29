import React, { Suspense, lazy, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Gauge,
  Map as MapIcon,
  MapPinned,
  Minus,
  ScanLine,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import PageHeader from "../components/PageHeader";
import MiniEnergyMap from "../components/MiniEnergyMap";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import HeaderActionButton from "../components/HeaderActionButton";
import ForecastChart, { ForecastLegend } from "../components/ForecastChart";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import {
  MONTH_LABELS,
  buildForecastModel,
  getForecastDirection,
  getNextMonthLabelsFromKey,
} from "../utils/forecast";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { formatCompact, formatDecimal, formatNumber } from "../utils/format";
import {
  annotateReadingCoverage,
  annualizeEui,
  computeEui,
  getEnergyStatus,
  getReadingSpanDays,
} from "../utils/energyStatus";
import {
  getAverageOcrAccuracy,
  getOcrScore,
  isLowOcrAccuracy,
} from "../utils/readingQuality";
import { useElectricityRate } from "../hooks/useElectricityRate";
import RateNotice from "../components/RateNotice";
import InfoHint from "../components/InfoHint";
import { DEFAULT_RATE_PER_KWH, formatPeso } from "../utils/currency";

// Opened by clicking a building in the EUI ranking or a pin on the map preview.
const BuildingProfile = lazy(() => import("../components/BuildingProfile"));

const AUTO_REFRESH_MS = 30000;

function normalizeBuilding(building) {
  return {
    building_id: building.building_id,
    name: building.name || "Unnamed Building",
    latitude: building.latitude,
    longitude: building.longitude,
    floor_area: Number(building.floor_area || 0),
    building_type: building.building_type || "Building",
    status: building.status || "Active",
  };
}

function normalizeMeter(meter) {
  return {
    meter_id: meter.meter_id,
    building_id: meter.building_id,
    serial_no: meter.serial_no || "No serial number",
    meter_type: meter.meter_type || "Digital",
    status: meter.status || "Active",
  };
}

function normalizeReading(reading) {
  const presentReading = Number(reading.reading_value || 0);
  const previousReading = Number(reading.previous_reading ?? 0);
  return {
    record_id: reading.record_id,
    meter_id: reading.meter_id,
    user_id: reading.user_id,
    reading_value: presentReading,
    previous_reading: previousReading,
    differential: Math.max(presentReading - previousReading, 0),
    reading_date: reading.reading_date || "",
    image_path: reading.image_path || "",
    ocr_accuracy: getOcrScore(reading.ocr_accuracy),
    is_verified: Boolean(reading.is_verified),
  };
}

function formatDate(value) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRelativeDate(value) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const yesterday = new Date();

  yesterday.setDate(today.getDate() - 1);

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isToday) {
    return "Today";
  }

  if (isYesterday) {
    return "Yesterday";
  }

  return formatDate(value);
}

// getMonthName was removed with the year-blind month bucketing it existed for.
// Month labels now come from MONTH_LABELS plus the reading's year.

// computeEui and getEnergyStatus were local copies of the same thresholds that
// BuildingMap also carried. Both now come from utils/energyStatus.js so the
// Dashboard, the map, Analytics and Reports cannot drift apart again.

function getStatusClass(status) {
  if (status === "Normal" || status === "Verified" || status === "Active") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "High" || status === "Pending" || status === "Needs Review") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status === "Critical" || status === "Inactive") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
}

function getDotClass(status) {
  if (status === "Normal" || status === "Verified" || status === "Active") {
    return "bg-emerald-600";
  }

  if (status === "High" || status === "Pending" || status === "Needs Review") {
    return "bg-amber-500";
  }

  if (status === "Critical" || status === "Inactive") {
    return "bg-red-500";
  }

  return "bg-slate-400";
}

// ─── EnergyForecastCard ───────────────────────────────────────────────────────

function EnergyForecastCard({ monthlyConsumption, rate, onOpenAnalytics }) {
  const HORIZON = 3;
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  // The same back-tested model as the Analytics page. This card used to show a
  // moving average and a linear trend side by side (10,103 vs 11,562 kWh on the
  // demo data) with nothing to say which one to believe.
  const model = useMemo(
    () =>
      buildForecastModel(monthlyConsumption, HORIZON, (lastPoint, count) =>
        getNextMonthLabelsFromKey(lastPoint.sortKey, count)
      ),
    [monthlyConsumption]
  );

  const bestMethod = model?.methods.find((method) => method.key === model.bestKey);
  const nextMonth = model?.series.find((row) => row.isForecast);
  const lastMonth = model?.series.filter((row) => !row.isForecast).at(-1);
  const nextValue = nextMonth && model ? nextMonth[model.bestKey] : 0;
  const lastActual = lastMonth?.actual ?? 0;
  const nextChange = lastActual > 0 ? ((nextValue - lastActual) / lastActual) * 100 : 0;
  const direction = getForecastDirection(model).label;
  const DirectionIcon =
    direction === "Rising" ? TrendingUp : direction === "Falling" ? TrendingDown : Minus;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 440ms ease, transform 440ms ease",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {model && (
            /* Carries its own reference point. Beside it sits a delta measured
               against last month alone, and the two can legitimately disagree -
               the forecast can be above August and still below the half-year
               average. Unlabelled, that read as the card contradicting itself.
               Toned by direction too: rising consumption is the bad one, and it
               used to be painted emerald whichever way it pointed. */
            <div
              className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                direction === "Rising"
                  ? "border-red-100 bg-red-50 text-red-600"
                  : direction === "Falling"
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              <DirectionIcon size={12} />
              {direction} vs 6-month average
            </div>
          )}

          <h2 className="text-base font-semibold text-slate-950">Energy Forecast</h2>
        </div>

        {onOpenAnalytics && (
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Compare all 3 methods
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {!model ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 py-5 text-center text-sm font-semibold text-slate-400">
          Needs readings from at least 3 months.
        </div>
      ) : (
        <>
          {/* Leads with the answer, not the machinery. The previous version put
              "Method: Weighted MA / Best of 3" and "Avg error ±12%" beside the
              figure, which describes how the system works rather than what the
              reader came to find out. Which estimator won and how the three
              compare is the Analytics page's job. */}
          <div className="mb-4 border-y border-slate-100 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Next month · {nextMonth.month}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <p className="text-3xl font-semibold leading-none tracking-tight text-slate-950">
                {formatNumber(nextValue)}
                <span className="ml-1.5 text-sm font-medium text-slate-400">kWh</span>
              </p>

              <TrendDelta change={nextChange} previousMonth={lastMonth.month} />
            </div>

            <p className="mt-2 text-sm font-normal text-slate-500">
              About{" "}
              <span className="font-semibold text-slate-900">
                {formatPeso(nextValue * rate, { decimals: 0 })}
              </span>{" "}
              at {formatPeso(rate)} per kWh.
            </p>

            <p className="mt-3 flex items-start gap-1.5 text-xs font-normal leading-5 text-slate-400">
              <span>
                {bestMethod.error !== null
                  ? `Checked against months that have already happened, this estimate has landed within about ${Math.round(
                      bestMethod.error * 100
                    )}% of the real figure.`
                  : "There is not enough history yet to check how close this estimate lands, so treat it as a rough direction."}
              </span>
              <InfoHint term="forecastMethod" align="right" />
            </p>
          </div>

          <ForecastLegend model={model} className="mb-2" leadingOnly />

          <ForecastChart
            model={model}
            className="h-44"
            gradientId="dashboardForecastBar"
            angledLabels={false}
            leadingOnly
          />
        </>
      )}
    </div>
  );
}

function ToastMessage({ toast, onClose }) {
  if (!toast.message) {
    return null;
  }

  const isError = toast.type === "error";

  return (
    <div className="fixed right-5 top-28 z-[50000] w-[calc(100%-2.5rem)] max-w-md">
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl ${
          isError
            ? "border-red-100 bg-red-50 text-red-800"
            : "border-emerald-100 bg-emerald-50 text-emerald-800"
        }`}
      >
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
            isError ? "bg-red-600 text-white" : "bg-emerald-700 text-white"
          }`}
        >
          {isError ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {isError ? "Something went wrong" : "Success"}
          </p>

          <p className="mt-1 text-sm font-normal leading-5 opacity-80">
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 opacity-70 transition hover:bg-white/70 hover:opacity-100"
        >
          <XCircle size={16} />
        </button>
      </div>
    </div>
  );
}

// Chart chrome follows the house data-viz rules: solid hairline gridlines (a
// dashed grid reads as "threshold" when it is just a grid), a 2px line, an area
// wash at ~10% opacity rather than a saturated block, and text in slate tokens
// instead of the series colour.
const TREND_LINE = "#059669";
const TREND_GRID = "#eef2f7";
const TREND_TICK = { fontSize: 11, fontWeight: 500, fill: "#94a3b8" };

const TREND_RANGES = [
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "12M", months: 12 },
  { key: "all", label: "All", months: null },
];

function TrendDelta({ change, previousMonth, className = "" }) {
  if (change === null || change === undefined) {
    return null;
  }

  // Rising consumption is the bad direction, so the status colour is inverted
  // against the usual "up is good" reading. Icon plus text, never colour alone.
  const Icon = change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const tone =
    change === 0
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : change > 0
        ? "border-red-100 bg-red-50 text-red-600"
        : "border-emerald-100 bg-emerald-50 text-emerald-700";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone} ${className}`}
    >
      <Icon size={13} />
      {change > 0 ? "+" : ""}
      {formatDecimal(change, 1)}%
      {previousMonth && (
        <span className="font-medium opacity-70">vs {previousMonth}</span>
      )}
    </span>
  );
}

function EnergyTrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;

  if (!point) {
    return null;
  }

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-4 rounded-full bg-emerald-600" />

        <p className="text-[11px] font-medium text-slate-400">{label}</p>
      </div>

      <p className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950">
        {formatNumber(point.value)}
        <span className="ml-1 text-xs font-medium text-slate-400">kWh</span>
      </p>

      {point.change !== null && (
        <TrendDelta
          change={point.change}
          previousMonth={point.previousMonth}
          className="mt-2"
        />
      )}
    </div>
  );
}

function TrendMetric({ label, value, hint, dashedKey = false }) {
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>

      {hint && (
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-normal text-slate-400">
          {dashedKey && (
            <span
              aria-hidden="true"
              className="block h-0 w-4 shrink-0"
              style={{ borderTop: "1.5px dashed #cbd5e1" }}
            />
          )}
          {hint}
        </p>
      )}
    </div>
  );
}

function EnergyTrendChart({ monthlyConsumption }) {
  const [range, setRange] = useState("all");

  const chartData = useMemo(
    () =>
      monthlyConsumption.map((item, index) => {
        const value = Number(item.value || 0);
        const previous =
          index > 0 ? Number(monthlyConsumption[index - 1].value || 0) : 0;

        return {
          month: item.month,
          // Twelve "Sep 2025" labels collide on the axis; the tooltip and the
          // metric strip still spell the month out in full.
          shortMonth: item.month.replace(" 20", " '"),
          value,
          previousMonth: index > 0 ? monthlyConsumption[index - 1].month : null,
          change: previous > 0 ? ((value - previous) / previous) * 100 : null,
        };
      }),
    [monthlyConsumption]
  );

  // Only offer a range that would actually hide something, so the control is
  // never three buttons that all draw the same chart.
  const rangeOptions = TREND_RANGES.filter(
    (option) => option.months === null || chartData.length > option.months
  );

  const activeRange =
    rangeOptions.find((option) => option.key === range) ??
    rangeOptions[rangeOptions.length - 1];

  const visible = activeRange?.months
    ? chartData.slice(-activeRange.months)
    : chartData;

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No consumption yet"
        description="Monthly usage appears here as soon as meter readings are saved."
        className="min-h-[320px] flex-1"
      />
    );
  }

  const rangeTotal = visible.reduce((sum, item) => sum + item.value, 0);
  const average = rangeTotal / visible.length;
  const peakIndex = visible.reduce(
    (best, item, index) => (item.value > visible[best].value ? index : best),
    0
  );
  const peak = visible[peakIndex];
  const latest = visible[visible.length - 1];

  // Direct-label the endpoint and the peak only. A value on every point is
  // noise, and the two that carry the story are the newest and the highest.
  const renderPointLabel = ({ x, y, index }) => {
    const isLast = index === visible.length - 1;
    const isPeak = index === peakIndex;
    // A peak label next door to the endpoint label would collide; the tooltip
    // and the metric strip below still carry it.
    const showPeak = isPeak && peakIndex < visible.length - 2;

    if (!isLast && !showPeak) {
      return null;
    }

    return (
      <text
        x={x}
        y={y - 14}
        textAnchor={isLast ? "end" : "middle"}
        className="fill-slate-900 text-[11px] font-semibold"
      >
        {isPeak ? "Peak " : ""}
        {formatCompact(visible[index].value)}
      </text>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-3xl font-semibold leading-none tracking-tight text-slate-950">
              {formatNumber(latest.value)}
              <span className="ml-1.5 text-sm font-medium text-slate-400">
                kWh
              </span>
            </p>

            <TrendDelta
              change={latest.change}
              previousMonth={latest.previousMonth}
            />
          </div>

          <p className="mt-2 text-xs font-medium text-slate-400">
            {latest.month} · latest month with saved readings
          </p>
        </div>

        {rangeOptions.length > 1 && (
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
            {rangeOptions.map((option) => {
              const isActive = option.key === activeRange?.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setRange(option.key)}
                  aria-pressed={isActive}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 min-h-[300px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={visible}
            margin={{ top: 30, right: 16, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="dashboardEnergyArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TREND_LINE} stopOpacity={0.14} />
                <stop offset="100%" stopColor={TREND_LINE} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke={TREND_GRID} />

            <XAxis
              dataKey="shortMonth"
              tick={TREND_TICK}
              axisLine={false}
              tickLine={false}
              minTickGap={4}
              interval="preserveStartEnd"
              height={28}
              dy={4}
            />

            <YAxis
              tick={TREND_TICK}
              tickFormatter={formatCompact}
              axisLine={false}
              tickLine={false}
              width={52}
            />

            <Tooltip
              content={<EnergyTrendTooltip />}
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
            />

            <ReferenceLine y={average} stroke="#cbd5e1" strokeDasharray="4 4" />

            <Area
              type="monotone"
              dataKey="value"
              stroke={TREND_LINE}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#dashboardEnergyArea)"
              // r 4 plus the 2px surface ring is the 8px minimum marker.
              dot={{ r: 4, fill: TREND_LINE, stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{
                r: 6,
                fill: TREND_LINE,
                stroke: "#ffffff",
                strokeWidth: 2.5,
              }}
              isAnimationActive
              animationDuration={800}
              animationEasing="ease-out"
            >
              <LabelList dataKey="value" content={renderPointLabel} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap divide-x divide-slate-100 border-t border-slate-100 pt-4">
        <TrendMetric
          label="Range total"
          value={`${formatNumber(rangeTotal)} kWh`}
          hint={`${visible.length} month${visible.length === 1 ? "" : "s"} shown`}
        />

        <TrendMetric
          label="Avg / month"
          value={`${formatCompact(average)} kWh`}
          hint="Dashed line"
          dashedKey
        />

        <TrendMetric
          label="Peak"
          value={`${formatCompact(peak.value)} kWh`}
          hint={peak.month}
        />
      </div>
    </div>
  );
}

function SectionCard({ children, className = "" }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function EuiComparisonCard({ buildingComparison, setCurrentPage, rate, onOpenBuilding }) {
  const topBuildings = buildingComparison.slice(0, 4);
  const maxEui = Math.max(...topBuildings.map((item) => item.eui), 1);

  return (
    <SectionCard>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            <BarChart3 size={13} />
            EUI Ranking
          </div>

          <h2 className="text-lg font-semibold text-slate-950">
            Building EUI Comparison
          </h2>

          <p className="mt-1 text-sm font-normal text-slate-400">
            Highest energy use per square meter.
          </p>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <BarChart3 size={23} />
        </div>
      </div>

      {topBuildings.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No building EUI data yet"
          description="EUI is calculated from meter readings and floor area. Add both to compare buildings here."
        />
      ) : (
        <div className="space-y-3">
          {topBuildings.map((item, index) => {
            const width = Math.max(8, Math.round((item.eui / maxEui) * 100));

            return (
              <button
                key={item.building_id}
                type="button"
                onClick={() => onOpenBuilding?.(item)}
                title={`Open ${item.building}'s profile`}
                className="block w-full animate-[sectionRise_450ms_ease-out_both] rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:border-emerald-100 hover:bg-white hover:shadow-md"
                style={{ animationDelay: `${index * 75}ms` }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-xs font-medium ${
                        index === 0
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-slate-500"
                      }`}
                    >
                      #{index + 1}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {item.building}
                      </p>

                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {formatDecimal(item.eui)} kWh/m² · {formatNumber(item.totalConsumption)} kWh · {formatPeso(item.totalConsumption * rate, { decimals: 0 })}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${getStatusClass(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getDotClass(
                      item.status
                    )}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCurrentPage && setCurrentPage("analytics")}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
      >
        View analytics
        <ArrowRight size={16} />
      </button>
    </SectionCard>
  );
}

function OcrStatusCard({
  averageOcrAccuracy,
  verifiedReadings,
  pendingReadings,
  lowAccuracyReadings,
  setCurrentPage,
}) {
  // null when every reading was typed in by hand, so there is no score to show.
  const hasScores =
    averageOcrAccuracy !== null && averageOcrAccuracy !== undefined;
  const accuracy = hasScores
    ? Math.max(0, Math.min(100, Number(averageOcrAccuracy)))
    : 0;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (accuracy / 100) * circumference;
  const needsReview = pendingReadings.length + lowAccuracyReadings.length;

  return (
    <SectionCard>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            <ScanLine size={13} />
            OCR Monitor
          </div>

          <h2 className="text-lg font-semibold text-slate-950">
            OCR Reading Status
          </h2>

          <p className="mt-1 text-sm font-normal text-slate-400">
            Accuracy and verification state.
          </p>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <ScanLine size={23} />
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 108 108" className="h-24 w-24 -rotate-90">
              <circle
                cx="54"
                cy="54"
                r="42"
                fill="none"
                stroke="#dbeafe"
                strokeWidth="11"
              />
              <circle
                cx="54"
                cy="54"
                r="42"
                fill="none"
                stroke="#059669"
                strokeLinecap="round"
                strokeWidth="11"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>

            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-2xl font-bold text-slate-950">
                  {hasScores ? `${accuracy}%` : "—"}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Accuracy
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">
              {needsReview > 0 ? "Needs Review" : "All Clear"}
            </p>

            <p className="mt-1 text-xs font-normal leading-5 text-slate-500">
              {needsReview > 0
                ? `${needsReview} reading${needsReview > 1 ? "s" : ""} require attention.`
                : "All OCR readings are currently verified."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-[11px] font-medium text-emerald-700">Verified</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {verifiedReadings.length}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[11px] font-medium text-amber-700">Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {pendingReadings.length}
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <p className="text-[11px] font-medium text-red-700">Low Acc.</p>
          <p className="mt-1 text-2xl font-bold text-red-700">
            {lowAccuracyReadings.length}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCurrentPage && setCurrentPage("ocr")}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-md"
      >
        Open OCR Upload
        <ChevronRight size={17} />
      </button>
    </SectionCard>
  );
}

export default function Dashboard({ role, setCurrentPage }) {
  const [buildings, setBuildings] = useState([]);
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [profileBuilding, setProfileBuilding] = useState(null);
  const { rate, isFallback: isRateFallback, error: rateError } = useElectricityRate();

  // Takes a buildingAnalytics row ({ building_id, building, ... }).
  function openBuildingProfile(row) {
    setProfileBuilding({ building_id: row.building_id, name: row.building });
  }
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });

  function showToast(message, type = "success") {
    setToast({ message, type });

    window.setTimeout(() => {
      setToast({ message: "", type: "success" });
    }, 3000);
  }

  async function fetchBuildings() {
    const response = await apiFetch(`${API_BASE_URL}/buildings/`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load buildings.");
    }

    return Array.isArray(data) ? data.map(normalizeBuilding) : [];
  }

  async function fetchMeters() {
    const response = await apiFetch(`${API_BASE_URL}/meters/`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load meters.");
    }

    return Array.isArray(data) ? data.map(normalizeMeter) : [];
  }

  async function fetchReadings() {
    const response = await apiFetch(`${API_BASE_URL}/readings/`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load readings.");
    }

    return Array.isArray(data) ? data.map(normalizeReading) : [];
  }

  async function refreshDashboardData() {
    setIsLoading(true);

    try {
      const [buildingData, meterData, readingData] = await Promise.all([
        fetchBuildings(),
        fetchMeters(),
        fetchReadings(),
      ]);

      setBuildings(buildingData);
      setMeters(meterData);
      // Coverage lets status be annualised the same way Analytics, Reports and
      // the GIS map do it.
      setReadings(annotateReadingCoverage(readingData));
    } catch (error) {
      console.error("Dashboard refresh error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(
    refreshDashboardData,
    {
      intervalMs: AUTO_REFRESH_MS,
      // Paused while a building profile is open; the profile loads its own data.
      enabled: !profileBuilding,
      runOnMount: true,
    }
  );

  // Rate loading moved to a shared hook so a failure is visible instead of
  // silently pricing everything at the ₱12 default.

  function getBuildingName(buildingId) {
    const building = buildings.find(
      (item) => Number(item.building_id) === Number(buildingId)
    );

    return building?.name || "Unknown building";
  }

  function getMeter(meterId) {
    return meters.find((meter) => Number(meter.meter_id) === Number(meterId));
  }

  const buildingAnalytics = useMemo(() => {
    return buildings
      .map((building) => {
        const buildingMeters = meters.filter(
          (meter) => Number(meter.building_id) === Number(building.building_id)
        );

        const meterIds = buildingMeters.map((meter) => Number(meter.meter_id));

        const buildingReadings = readings.filter((reading) =>
          meterIds.includes(Number(reading.meter_id))
        );

        const totalConsumption = buildingReadings.reduce(
          (sum, reading) => sum + reading.differential,
          0
        );

        // Annualised over the days the readings cover. This page used to grade
        // cumulative intensity, which only grows as history accumulates, so after
        // a year or two every building drifted into Critical here while Analytics
        // and the GIS map still showed it Normal.
        const spanDays = getReadingSpanDays(buildingReadings);
        const eui = annualizeEui(
          computeEui(totalConsumption, building.floor_area),
          spanDays
        );

        const averageAccuracy = getAverageOcrAccuracy(buildingReadings);

        const verifiedCount = buildingReadings.filter(
          (reading) => reading.is_verified
        ).length;

        const pendingCount = buildingReadings.filter(
          (reading) => !reading.is_verified
        ).length;

        const status = getEnergyStatus(
          totalConsumption,
          building.floor_area,
          spanDays
        );

        return {
          building_id: building.building_id,
          building: building.name,
          latitude: building.latitude,
          longitude: building.longitude,
          floorArea: building.floor_area,
          meterCount: buildingMeters.length,
          readingCount: buildingReadings.length,
          totalConsumption,
          eui,
          averageAccuracy,
          verifiedCount,
          pendingCount,
          status,
        };
      })
      .sort((a, b) => b.eui - a.eui);
  }, [buildings, meters, readings]);

  // Grouped by calendar month AND year. This used to bucket into a fixed Jan-Dec
  // array keyed on the bare month name, so September 2025 and September 2026 were
  // summed into the same bar and the chart silently misreported history spanning
  // more than a year.
  //
  // The lucide "Map" icon is imported as MapIcon rather than Map: importing it
  // under its own name shadows the global Map constructor, which is what made an
  // earlier version of this block throw "Map is not a constructor".
  const monthlyConsumption = useMemo(() => {
    const grouped = {};

    readings.forEach((reading) => {
      const date = new Date(reading.reading_date);

      if (Number.isNaN(date.getTime())) {
        return;
      }

      const sortKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (grouped[sortKey]) {
        grouped[sortKey].value += reading.differential;
        return;
      }

      grouped[sortKey] = {
        sortKey,
        month: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
        value: reading.differential,
      };
    });

    return Object.values(grouped).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey)
    );
  }, [readings]);

  const totalConsumption = readings.reduce(
    (sum, reading) => sum + reading.differential,
    0
  );

  const totalCost = totalConsumption * rate;

  const mappedBuildings = buildings.filter(
    (building) => building.latitude && building.longitude
  );

  const pendingReadings = readings.filter((reading) => !reading.is_verified);
  const verifiedReadings = readings.filter((reading) => reading.is_verified);
  // Photo readings only: a typed-in reading has no OCR score to be low.
  const lowAccuracyReadings = readings.filter(isLowOcrAccuracy);

  const averageOcrAccuracy = getAverageOcrAccuracy(readings);

  const averageEui = buildingAnalytics.length
    ? buildingAnalytics.reduce((sum, building) => sum + Number(building.eui), 0) /
      buildingAnalytics.length
    : 0;

  const highestBuilding = buildingAnalytics[0];

  const latestReadings = [...readings]
    .sort((a, b) => {
      const dateA = new Date(a.reading_date).getTime() || 0;
      const dateB = new Date(b.reading_date).getTime() || 0;

      return dateB - dateA;
    })
    .slice(0, 5);

  const buildingComparison = buildingAnalytics.slice(0, 5).map((building) => {
    const maxEui = Math.max(...buildingAnalytics.map((item) => item.eui), 1);
    const percentage = Math.max(6, Math.round((building.eui / maxEui) * 100));

    return {
      ...building,
      percentage,
    };
  });

  const mapStatusSummary = buildingAnalytics.reduce(
    (summary, building) => {
      if (building.status === "Normal") summary.normal += 1;
      else if (building.status === "High") summary.high += 1;
      else if (building.status === "Critical") summary.critical += 1;
      else summary.noData += 1;

      return summary;
    },
    {
      normal: 0,
      high: 0,
      critical: 0,
      noData: 0,
    }
  );

  const overviewCards = [
    {
      title: "Total Buildings",
      value: buildings.length,
      subtitle: `${mappedBuildings.length} mapped with GIS coordinates`,
      icon: Building2,
      color: "emerald",
    },
    {
      title: "Total Energy Used",
      hint: "measuredVsEstimated",
      value: formatNumber(totalConsumption),
      subtitle: `kWh · ≈ ${formatPeso(totalCost, { decimals: 0 })} estimated bill`,
      icon: Zap,
      color: "emerald",
    },
    {
      title: "Energy Intensity",
      hint: "eui",
      value: formatDecimal(averageEui),
      subtitle: highestBuilding
        ? `kWh/m² · Highest: ${highestBuilding.building}`
        : "kWh/m² · No EUI records yet",
      icon: TrendingUp,
      color: averageEui > 20 ? "red" : averageEui > 10 ? "amber" : "emerald",
    },
    {
      title: "Readings to Check",
      hint: "needsReview",
      value: pendingReadings.length,
      subtitle: `${verifiedReadings.length} verified readings saved`,
      icon: ScanLine,
      color: pendingReadings.length > 0 ? "amber" : "emerald",
    },
  ];

  return (
    <div className="space-y-6">
      <ToastMessage
        toast={toast}
        onClose={() => setToast({ message: "", type: "success" })}
      />

      <PageHeader
        eyebrow="EnerSight Command Overview"
        title="Energy Monitoring Dashboard"
        subtitle="Monitor buildings, consumption, OCR readings, and reports."
        icon={Gauge}
        role={role || "User"}
        status={isLoading ? "Backend: Syncing" : "Backend: Connected"}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoading}
        intervalMs={AUTO_REFRESH_MS}
      />

      <RateNotice isFallback={isRateFallback} error={rateError} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Energy Consumption Trend
              </h2>

              <p className="mt-1 text-sm font-normal text-slate-400">
                Monthly usage from saved meter readings.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage && setCurrentPage("analytics")}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              View Analytics
              <ArrowRight size={15} />
            </button>
          </div>

          <EnergyTrendChart monthlyConsumption={monthlyConsumption} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                GIS Energy Map
              </h2>

              <p className="mt-1 text-sm font-normal text-slate-400">
                Building EUI status preview. Click a pin for its full profile.
              </p>
            </div>

            <MapPinned size={22} className="text-emerald-700" />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              <Database size={14} />
              {mappedBuildings.length} Mapped
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              <AlertTriangle size={14} />
              {mapStatusSummary.critical} Critical
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              <TrendingUp size={14} />
              Intensity {formatDecimal(averageEui)}
            </div>
          </div>

          <MiniEnergyMap
            buildings={buildingAnalytics}
            height={315}
            onSelectBuilding={openBuildingProfile}
          />

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-4">
            <span className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              Normal
            </span>

            <span className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              High
            </span>

            <span className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Critical
            </span>

            <span className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              No Data
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCurrentPage && setCurrentPage("map")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <MapIcon size={17} />
            Open Building Map
          </button>
        </div>
      </section>

      <section>
        <EnergyForecastCard
          monthlyConsumption={monthlyConsumption}
          rate={rate}
          onOpenAnalytics={() => setCurrentPage && setCurrentPage("analytics")}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <EuiComparisonCard
          buildingComparison={buildingComparison}
          setCurrentPage={setCurrentPage}
          rate={rate}
          onOpenBuilding={openBuildingProfile}
        />

        <OcrStatusCard
          averageOcrAccuracy={averageOcrAccuracy}
          verifiedReadings={verifiedReadings}
          pendingReadings={pendingReadings}
          lowAccuracyReadings={lowAccuracyReadings}
          setCurrentPage={setCurrentPage}
        />
      </section>

      <section>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Latest Meter Readings
              </h2>

              <p className="mt-1 text-sm font-normal text-slate-400">
                Recently saved readings.
              </p>
            </div>

            <Clock3 size={22} className="text-emerald-700" />
          </div>

          {latestReadings.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No readings yet"
              description="Saved meter readings show up here as soon as the first one is recorded."
              action={
                setCurrentPage ? (
                  <HeaderActionButton
                    icon={ScanLine}
                    variant="dark"
                    onClick={() => setCurrentPage("ocr")}
                  >
                    Add Meter Reading
                  </HeaderActionButton>
                ) : null
              }
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {latestReadings.map((reading) => {
                const meter = getMeter(reading.meter_id);
                const buildingName = meter
                  ? getBuildingName(meter.building_id)
                  : "Unknown building";

                return (
                  <div
                    key={reading.record_id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {buildingName}
                      </p>

                      <p className="mt-1 text-xs font-normal text-slate-500">
                        Meter: {meter?.serial_no || reading.meter_id} ·{" "}
                        {getRelativeDate(reading.reading_date)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-950">
                        {formatNumber(reading.reading_value)} kWh
                      </p>

                      <span
                        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusClass(
                          reading.is_verified ? "Verified" : "Pending"
                        )}`}
                      >
                        {reading.is_verified ? "Verified" : "Pending"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </section>

      {profileBuilding && (
        <Suspense fallback={null}>
          <BuildingProfile
            key={profileBuilding.building_id}
            buildingId={profileBuilding.building_id}
            buildingName={profileBuilding.name}
            onClose={() => setProfileBuilding(null)}
          />
        </Suspense>
      )}

      <style>
        {`
          @keyframes sectionRise {
            from {
              opacity: 0;
              transform: translateY(12px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
    </div>
  );
}