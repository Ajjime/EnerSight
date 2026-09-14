import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  Building2,
  Coins,
  Download,
  Lightbulb,
  Minus,
  Plug,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { applianceKwhMonth, formatPeso } from "../utils/currency";
import {
  buildForecastModel,
  fillMonthGaps,
  getNextMonthLabelsFromKey,
} from "../utils/forecast";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { formatCompact, formatDecimal, formatNumber } from "../utils/format";
import { useElectricityRate } from "../hooks/useElectricityRate";
import RateNotice from "../components/RateNotice";
import {
  EUI_CRITICAL_THRESHOLD,
  EUI_HIGH_THRESHOLD,
  MIN_DAYS_TO_ANNUALIZE,
  annotateReadingCoverage,
  annualizeEui,
  computeEui,
  getEnergyStatus,
  getReadingSpanDays,
} from "../utils/energyStatus";
import {
  formatOcrAccuracy,
  getAverageOcrAccuracy,
  getOcrScore,
  isHighOcrAccuracy,
  isLowOcrAccuracy,
  isManualReading,
} from "../utils/readingQuality";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import SkeletonRows from "../components/SkeletonRows";
const AUTO_REFRESH_MS = 60000;
const DAYS_PER_MONTH = 365 / 12;
const DAY_MS = 86400000;

const periodOptions = [
  "All Time",
  "This Month",
  "Last Month",
  "This Year",
  "Custom Range",
];
// "No Data" is reachable now that status is graded by energy intensity: a building
// with no floor area recorded cannot be scored.
const statusOptions = ["All Status", "Normal", "High", "Critical", "No Data"];

// Worst first. "No Data" ranks above Normal because, for a building that has
// readings, it means the floor area is missing, which is itself something to fix.
const STATUS_RANK = { Critical: 0, High: 1, "No Data": 2, Normal: 3 };

// Measured use within this fraction of the appliance estimate counts as agreeing.
const APPLIANCE_GAP_TOLERANCE = 0.15;

const COMPARISON_METRICS = [
  { value: "kwh", label: "kWh" },
  { value: "eui", label: "EUI" },
  { value: "cost", label: "₱" },
];

const COMPARISON_SUBTITLES = {
  kwh: "Total energy consumption by building.",
  eui: "Energy use per square metre per year, the basis of each status.",
  cost: "Estimated electricity cost by building.",
};

const FORECAST_COLORS = {
  average: "#059669",
  trend: "#64748b",
  seasonal: "#d97706",
};

function normalizeBuilding(building) {
  return {
    building_id: building.building_id,
    name: building.name || "",
    status: building.status || "Active",
    // Needed for the energy-intensity status rule, which is what the GIS map and
    // the Dashboard use. Without it every building here would read "No Data".
    floor_area: Number(building.floor_area || 0),
  };
}

function normalizeMeter(meter) {
  return {
    meter_id: meter.meter_id,
    building_id: meter.building_id,
    serial_no: meter.serial_no || "",
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
    // null for a typed-in reading; see utils/readingQuality.js.
    ocr_accuracy: getOcrScore(reading.ocr_accuracy),
    is_verified: Boolean(reading.is_verified),
  };
}

function normalizeAppliance(appliance) {
  return {
    appliance_id: appliance.appliance_id,
    building_id: appliance.building_id,
    kwh_month: applianceKwhMonth(appliance),
  };
}

// ─── Periods ─────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" from a date input -> local midnight in ms, plus `dayOffset` days. */
function parseDateInput(value, dayOffset = 0) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + dayOffset).getTime();
}

function formatMonthYear(time) {
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * The selected date window and the window it is compared against. Times are epoch
 * milliseconds, start inclusive and end exclusive; `current: null` means no limit.
 *
 * Partial periods compare like with like: this month so far against the same
 * number of days at the start of last month, not against all of last month.
 */
function getPeriodWindows(period, customFrom, customTo) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "This Month" || period === "This Year") {
    const isMonth = period === "This Month";
    const start = (isMonth ? new Date(year, month, 1) : new Date(year, 0, 1)).getTime();
    const end = (isMonth ? new Date(year, month + 1, 1) : new Date(year + 1, 0, 1)).getTime();
    const previousStart = (
      isMonth ? new Date(year, month - 1, 1) : new Date(year - 1, 0, 1)
    ).getTime();

    return {
      current: { start, end },
      previous: {
        start: previousStart,
        end: Math.min(previousStart + (now.getTime() - start), start),
      },
      previousLabel: isMonth ? "the same point last month" : "the same point last year",
    };
  }

  if (period === "Last Month") {
    const start = new Date(year, month - 1, 1).getTime();
    const previousStart = new Date(year, month - 2, 1).getTime();

    return {
      current: { start, end: new Date(year, month, 1).getTime() },
      previous: { start: previousStart, end: start },
      previousLabel: formatMonthYear(previousStart),
    };
  }

  if (period === "Custom Range") {
    const from = parseDateInput(customFrom);
    // The "to" day is inclusive, so the window runs to the start of the next day.
    const to = parseDateInput(customTo, 1);

    if (from === null && to === null) {
      return { current: null, previous: null, previousLabel: "" };
    }

    const current = { start: from ?? -Infinity, end: to ?? Infinity };

    if (from === null || to === null || to <= from) {
      return { current, previous: null, previousLabel: "" };
    }

    const length = to - from;
    const days = Math.round(length / DAY_MS);

    return {
      current,
      previous: { start: from - length, end: from },
      previousLabel: `the previous ${days} day${days === 1 ? "" : "s"}`,
    };
  }

  return { current: null, previous: null, previousLabel: "" };
}

function isInWindow(readingDate, window) {
  if (!window) return true;
  if (!readingDate) return false;
  const time = new Date(readingDate).getTime();
  return Number.isFinite(time) && time >= window.start && time < window.end;
}

// ─── Formatting and rules ────────────────────────────────────────────────────

// The status rule now lives in utils/energyStatus.js. This page used to grade by
// raw kWh (>= 5000 Critical), which disagreed with the GIS map and the Dashboard on
// the same building and simply ranked buildings by size.

function getStatusStyle(status) {
  if (status === "Normal" || status === "Verified")
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "High" || status === "Needs Review")
    return "border-amber-100 bg-amber-50 text-amber-700";
  if (status === "Critical" || status === "Low Accuracy")
    return "border-red-100 bg-red-50 text-red-700";
  return "border-slate-100 bg-slate-50 text-slate-600";
}

function getAccuracyStyle(accuracy) {
  const score = getOcrScore(accuracy);
  if (score === null) return "border-slate-200 bg-slate-50 text-slate-500";
  if (score >= 90) return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (score >= 80) return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-red-100 bg-red-50 text-red-700";
}

function getMonthLabel(readingDate) {
  const date = new Date(readingDate);
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

// Sortable "YYYY-MM" companion to the display label. Readings arrive newest-first
// from the API, so the trend has to be ordered by this, not by arrival.
function getMonthSortKey(readingDate) {
  if (!readingDate) return "";
  const date = new Date(readingDate);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function formatPercent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

function formatEui(row) {
  return row.status === "No Data" ? "—" : formatDecimal(row.eui, 1);
}

function getRecommendation(row) {
  if (row.status === "Critical")
    return "Immediate review recommended. Check equipment usage, schedule, and meter readings.";
  if (row.status === "High")
    return "Monitor this building closely and compare with previous readings.";
  if (row.status === "No Data")
    return row.floorArea > 0
      ? "No consumption recorded in this period."
      : "Add this building's floor area on the Buildings page so its energy intensity can be graded.";
  if (row.lowAccuracyCount > 0)
    return `${row.lowAccuracyCount} photo reading${row.lowAccuracyCount === 1 ? "" : "s"} scored below 90%. Re-check those photos before reporting.`;
  if (row.pendingCount > 0)
    return "Some readings still need manual verification.";
  return "Consumption and reading quality are within normal monitoring range.";
}

function getApplianceVerdict(row) {
  if (row.applianceKwhMonth === null) {
    return { text: "No appliance list for this building yet.", badge: null };
  }
  if (row.applianceKwhMonth <= 0) {
    return {
      text: "The appliance list adds up to 0 kWh. Check the wattage and hours entered.",
      badge: null,
    };
  }
  if (row.monthlyConsumption === null) {
    return {
      text: "Not enough readings in this period to work out a monthly figure.",
      badge: null,
    };
  }

  const percent = formatPercent(Math.abs(row.gap));

  if (row.gap > APPLIANCE_GAP_TOLERANCE) {
    return {
      text: `Uses ${percent} more than its appliances explain. Look for unlisted equipment, longer operating hours, or waste.`,
      badge: row.gap > 0.5 ? "border-red-100 bg-red-50 text-red-700" : "border-amber-100 bg-amber-50 text-amber-700",
    };
  }
  if (row.gap < -APPLIANCE_GAP_TOLERANCE) {
    return {
      text: `Uses ${percent} less than estimated. The listed hours or quantities may be too high.`,
      badge: "border-blue-100 bg-blue-50 text-blue-700",
    };
  }
  return {
    text: "Measured use matches the appliance list within 15%.",
    badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };
}

// ─── Table sorting and export ────────────────────────────────────────────────

const SORT_ACCESSORS = {
  building: (row) => row.building.toLowerCase(),
  meterCount: (row) => row.meterCount,
  readingCount: (row) => row.readingCount,
  totalConsumption: (row) => row.totalConsumption,
  monthlyConsumption: (row) => row.monthlyConsumption,
  eui: (row) => (row.status === "No Data" ? null : row.eui),
  estimatedCost: (row) => row.estimatedCost,
  averageAccuracy: (row) => row.averageAccuracy,
  status: (row) => STATUS_RANK[row.status] ?? 9,
};

function sortRows(rows, sort) {
  const accessor = SORT_ACCESSORS[sort.key] || SORT_ACCESSORS.totalConsumption;
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);

    // Missing values sort last whichever way the column is ordered.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "string") return left.localeCompare(right) * factor;
    return (left - right) * factor;
  });
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  // The byte-order mark makes Excel read the file as UTF-8, so ₱ and m² survive.
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function roundTo2(value) {
  return Math.round(Number(value) * 100) / 100;
}

// ─── Small components ────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, action, children, animDelay = 0 }) {
  return (
    <div
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      style={{ animation: `analyticsCardIn 420ms ease-out ${animDelay}ms both` }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-xs font-normal text-slate-400">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
            value === option.value
              ? "bg-emerald-700 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChangeNote({ change, label }) {
  if (change === null) {
    return <>No earlier readings to compare</>;
  }

  const percent = Math.round(change * 100);

  if (percent === 0) {
    return <>No change vs {label}</>;
  }

  const isRising = percent > 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          isRising ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
        }`}
      >
        {isRising ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {isRising ? "+" : ""}
        {percent}%
      </span>
      vs {label}
    </span>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      {point?.isGap ? (
        <p className="mt-1 text-xs font-medium text-slate-500">No readings recorded</p>
      ) : (
        <p className="mt-1 text-base font-semibold text-emerald-700">
          {formatNumber(payload[0]?.value)} <span className="text-xs font-normal">kWh</span>
        </p>
      )}
    </div>
  );
}

function ComparisonTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="min-w-[200px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Consumption</dt>
          <dd className="font-semibold text-slate-950">{formatNumber(row.totalConsumption)} kWh</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">EUI</dt>
          <dd className="font-semibold text-slate-950">
            {row.status === "No Data" ? "—" : `${formatDecimal(row.eui, 1)} kWh/m²/yr`}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Est. cost</dt>
          <dd className="font-semibold text-slate-950">{formatPeso(row.estimatedCost, { decimals: 0 })}</dd>
        </div>
      </dl>
      <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusStyle(row.status)}`}>
        {row.status}
      </span>
    </div>
  );
}

function ForecastTooltip({ active, payload, label, model }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="min-w-[200px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
        {point.isForecast && (
          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 normal-case">
            Forecast
          </span>
        )}
      </p>
      {!point.isForecast && (
        <p className="text-xs font-semibold text-slate-950">
          {point.isGap ? "No readings recorded" : `Actual: ${formatNumber(point.actual)} kWh`}
        </p>
      )}
      {model.methods
        .filter((method) => method.available && point[method.key] !== null && point[method.key] !== undefined)
        .map((method) => (
          <p key={method.key} style={{ color: FORECAST_COLORS[method.key] }} className="mt-1 text-xs font-medium">
            {method.label}
            {method.key === model.bestKey ? " (leading)" : ""}: {formatNumber(point[method.key])} kWh
          </p>
        ))}
    </div>
  );
}

function DonutCenter({ total, label }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <p className="text-2xl font-bold text-slate-950 leading-none">{total}</p>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

const RATE_TONES = {
  emerald: { text: "text-emerald-700", fill: "bg-emerald-500" },
  blue: { text: "text-blue-700", fill: "bg-blue-500" },
};

function QualityRate({ label, percent, tone }) {
  const toneStyle = RATE_TONES[tone] || RATE_TONES.emerald;
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <span className={`text-sm font-semibold ${toneStyle.text}`}>{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-700 ${toneStyle.fill}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function QualityCountRow({ color, label, hint, count, hollow = false }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${hollow ? "border-2" : ""}`}
        style={hollow ? { borderColor: color } : { background: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      <p className="text-base font-semibold tabular-nums text-slate-950">{count}</p>
    </div>
  );
}

function GapBar({ label, value, max, fillClass }) {
  const width = value && max ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[62px_1fr_104px] items-center gap-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        {value !== null && (
          <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${width}%` }} />
        )}
      </div>
      <span className="text-right font-medium tabular-nums text-slate-700">
        {value === null ? "—" : `${formatNumber(value)} kWh/mo`}
      </span>
    </div>
  );
}

function SortHeader({ label, sortKey, sort, onSort }) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      className={`inline-flex items-center gap-1 uppercase tracking-[0.14em] transition hover:text-slate-700 ${
        isActive ? "text-slate-700" : ""
      }`}
    >
      {label}
      <Icon size={12} className={isActive ? "" : "opacity-50"} />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Kept next to the real row's grid-cols-[...] class so the two stay in step.
const ANALYTICS_ROW_COLUMNS = "1.4fr 0.6fr 0.7fr 0.95fr 0.95fr 0.75fr 0.9fr 0.75fr 0.8fr";

const Analytics = () => {
  const [buildings, setBuildings] = useState([]);
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [applianceError, setApplianceError] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("All Buildings");
  const [periodFilter, setPeriodFilter] = useState("All Time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [forecastHorizon, setForecastHorizon] = useState(3);
  const [comparisonMetric, setComparisonMetric] = useState("kwh");
  const [tableSort, setTableSort] = useState({ key: "totalConsumption", direction: "desc" });
  const { rate, isFallback: isRateFallback, error: rateError } = useElectricityRate();

  const buildingsById = useMemo(
    () => new Map(buildings.map((b) => [Number(b.building_id), b])),
    [buildings]
  );

  const meterBuildingIds = useMemo(
    () => new Map(meters.map((m) => [Number(m.meter_id), Number(m.building_id)])),
    [meters]
  );

  const meterCountByBuilding = useMemo(() => {
    const counts = new Map();
    meters.forEach((meter) => {
      const id = Number(meter.building_id);
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }, [meters]);

  const applianceKwhByBuilding = useMemo(() => {
    const totals = new Map();
    appliances.forEach((appliance) => {
      const id = Number(appliance.building_id);
      totals.set(id, (totals.get(id) || 0) + appliance.kwh_month);
    });
    return totals;
  }, [appliances]);

  const matchesBuildingFilter = useCallback(
    (buildingId) =>
      buildingFilter === "All Buildings" ||
      buildingsById.get(Number(buildingId))?.name === buildingFilter,
    [buildingFilter, buildingsById]
  );

  async function fetchBuildings() {
    const response = await apiFetch(`${API_BASE_URL}/buildings/`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not load buildings.");
    return Array.isArray(data) ? data.map(normalizeBuilding) : [];
  }

  async function fetchMeters() {
    const response = await apiFetch(`${API_BASE_URL}/meters/`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not load meters.");
    return Array.isArray(data) ? data.map(normalizeMeter) : [];
  }

  async function fetchReadings() {
    const response = await apiFetch(`${API_BASE_URL}/readings/`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not load readings.");
    return Array.isArray(data) ? data.map(normalizeReading) : [];
  }

  // Appliances only feed the measured-vs-estimate section, so a failure here is
  // reported there instead of blanking the whole page.
  async function fetchAppliances() {
    try {
      const response = await apiFetch(`${API_BASE_URL}/appliances/`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load appliances.");
      return { list: Array.isArray(data) ? data.map(normalizeAppliance) : [], error: "" };
    } catch (error) {
      return { list: [], error: error.message || "Could not load appliances." };
    }
  }

  async function refreshData() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const [buildingData, meterData, readingData, applianceResult] = await Promise.all([
        fetchBuildings(),
        fetchMeters(),
        fetchReadings(),
        fetchAppliances(),
      ]);
      setBuildings(buildingData);
      setMeters(meterData);
      // Stamped on the full list, before the period filter can drop the previous
      // reading that each one's time window is measured from.
      setReadings(annotateReadingCoverage(readingData));
      setAppliances(applianceResult.list);
      setApplianceError(applianceResult.error);
    } catch (error) {
      console.error("Analytics refresh error:", error);
      setErrorMessage(
        error.message || "Cannot connect to server. Please make sure FastAPI is running."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(
    () => refreshData(),
    { intervalMs: AUTO_REFRESH_MS }
  );

  // Rate loading moved to a shared hook so a failure is visible instead of
  // silently pricing everything at the default rate.

  const periodWindows = useMemo(
    () => getPeriodWindows(periodFilter, customFrom, customTo),
    [periodFilter, customFrom, customTo]
  );
  const {
    current: currentWindow,
    previous: previousWindow,
    previousLabel,
  } = periodWindows;

  const isCustomRangeInvalid =
    periodFilter === "Custom Range" && customFrom && customTo && customFrom > customTo;

  const hasActiveFilters =
    buildingFilter !== "All Buildings" ||
    periodFilter !== "All Time" ||
    statusFilter !== "All Status";

  function clearFilters() {
    setBuildingFilter("All Buildings");
    setPeriodFilter("All Time");
    setStatusFilter("All Status");
    setCustomFrom("");
    setCustomTo("");
  }

  // Building and date scope. Status is graded from these readings, so they cannot
  // themselves depend on the status filter.
  const scopedReadings = useMemo(
    () =>
      readings.filter(
        (reading) =>
          matchesBuildingFilter(meterBuildingIds.get(Number(reading.meter_id))) &&
          isInWindow(reading.reading_date, currentWindow)
      ),
    [readings, meterBuildingIds, matchesBuildingFilter, currentWindow]
  );

  const buildingRows = useMemo(() => {
    const readingsByBuilding = new Map();

    scopedReadings.forEach((reading) => {
      const buildingId = meterBuildingIds.get(Number(reading.meter_id));
      if (buildingId === undefined) return;
      if (!readingsByBuilding.has(buildingId)) readingsByBuilding.set(buildingId, []);
      readingsByBuilding.get(buildingId).push(reading);
    });

    return buildings.map((building) => {
      const buildingId = Number(building.building_id);
      const buildingReadings = readingsByBuilding.get(buildingId) || [];
      const totalConsumption = buildingReadings.reduce(
        (sum, reading) => sum + reading.differential,
        0
      );
      // The days these readings actually cover, so the status and EUI mean the
      // same thing whether the period is one month or three years.
      const spanDays = getReadingSpanDays(buildingReadings);
      const isAnnualized = spanDays >= MIN_DAYS_TO_ANNUALIZE;

      return {
        building_id: building.building_id,
        building: building.name,
        floorArea: building.floor_area,
        meterCount: meterCountByBuilding.get(buildingId) || 0,
        readingCount: buildingReadings.length,
        totalConsumption,
        estimatedCost: totalConsumption * rate,
        eui: annualizeEui(computeEui(totalConsumption, building.floor_area), spanDays),
        isAnnualized,
        monthlyConsumption: isAnnualized
          ? totalConsumption / (spanDays / DAYS_PER_MONTH)
          : null,
        applianceKwhMonth: applianceKwhByBuilding.has(buildingId)
          ? applianceKwhByBuilding.get(buildingId)
          : null,
        averageAccuracy: getAverageOcrAccuracy(buildingReadings),
        lowAccuracyCount: buildingReadings.filter(isLowOcrAccuracy).length,
        manualCount: buildingReadings.filter(isManualReading).length,
        verifiedCount: buildingReadings.filter((r) => r.is_verified).length,
        pendingCount: buildingReadings.filter((r) => !r.is_verified).length,
        status: getEnergyStatus(totalConsumption, building.floor_area, spanDays),
      };
    });
  }, [
    buildings,
    scopedReadings,
    meterBuildingIds,
    meterCountByBuilding,
    applianceKwhByBuilding,
    rate,
  ]);

  const matchingBuildingIds = useMemo(
    () =>
      new Set(
        buildingRows
          .filter((row) => statusFilter === "All Status" || row.status === statusFilter)
          .map((row) => Number(row.building_id))
      ),
    [buildingRows, statusFilter]
  );

  // Everything below reads from this, so the status filter moves the stat cards,
  // trend, quality and forecast along with the chart and table. It used to narrow
  // only the chart and table, leaving totals that counted every building.
  const filteredReadings = useMemo(() => {
    if (statusFilter === "All Status") return scopedReadings;
    return scopedReadings.filter((reading) =>
      matchingBuildingIds.has(meterBuildingIds.get(Number(reading.meter_id)))
    );
  }, [scopedReadings, statusFilter, matchingBuildingIds, meterBuildingIds]);

  const buildingAnalytics = useMemo(
    () =>
      buildingRows.filter(
        (row) =>
          matchingBuildingIds.has(Number(row.building_id)) &&
          matchesBuildingFilter(row.building_id)
      ),
    [buildingRows, matchingBuildingIds, matchesBuildingFilter]
  );

  const previousTotals = useMemo(() => {
    if (!previousWindow) return null;

    let kwh = 0;
    let count = 0;

    readings.forEach((reading) => {
      const buildingId = meterBuildingIds.get(Number(reading.meter_id));
      if (!matchesBuildingFilter(buildingId)) return;
      if (statusFilter !== "All Status" && !matchingBuildingIds.has(buildingId)) return;
      if (!isInWindow(reading.reading_date, previousWindow)) return;
      kwh += reading.differential;
      count += 1;
    });

    return { kwh, count };
  }, [
    readings,
    meterBuildingIds,
    matchesBuildingFilter,
    statusFilter,
    matchingBuildingIds,
    previousWindow,
  ]);

  const monthlyTrend = useMemo(() => {
    const grouped = {};
    filteredReadings.forEach((reading) => {
      // Undated readings cannot be placed on a timeline.
      const sortKey = getMonthSortKey(reading.reading_date);
      if (!sortKey) return;
      if (!grouped[sortKey]) {
        grouped[sortKey] = {
          month: getMonthLabel(reading.reading_date),
          sortKey,
          value: 0,
        };
      }
      grouped[sortKey].value += reading.differential;
    });
    const points = Object.values(grouped).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey)
    );
    // A month with no readings stays on the axis at zero instead of vanishing, so
    // the spacing between points is real time. See fillMonthGaps for why zero.
    return fillMonthGaps(points).map((point) => ({
      ...point,
      consumption: point.value,
    }));
  }, [filteredReadings]);

  const forecastModel = useMemo(
    () =>
      buildForecastModel(monthlyTrend, forecastHorizon, (lastPoint, count) =>
        getNextMonthLabelsFromKey(lastPoint.sortKey, count)
      ),
    [monthlyTrend, forecastHorizon]
  );

  const comparisonData = useMemo(() => {
    const valueOf = {
      kwh: (row) => row.totalConsumption,
      eui: (row) => (row.status === "No Data" ? 0 : row.eui),
      cost: (row) => row.estimatedCost,
    }[comparisonMetric];
    return buildingAnalytics
      .map((row) => ({ ...row, metricValue: valueOf(row) }))
      .sort((a, b) => b.metricValue - a.metricValue);
  }, [buildingAnalytics, comparisonMetric]);

  const priorityInsights = useMemo(
    () =>
      buildingAnalytics
        .filter((row) => row.readingCount > 0)
        .sort(
          (a, b) =>
            (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.eui - a.eui
        )
        .slice(0, 3),
    [buildingAnalytics]
  );

  const applianceRows = useMemo(
    () =>
      buildingAnalytics
        .map((row) => ({
          ...row,
          gap:
            row.applianceKwhMonth > 0 && row.monthlyConsumption !== null
              ? (row.monthlyConsumption - row.applianceKwhMonth) / row.applianceKwhMonth
              : null,
        }))
        .sort((a, b) => {
          if (a.gap === null && b.gap === null) return 0;
          if (a.gap === null) return 1;
          if (b.gap === null) return -1;
          return b.gap - a.gap;
        }),
    [buildingAnalytics]
  );

  const sortedTableRows = useMemo(
    () => sortRows(buildingAnalytics, tableSort),
    [buildingAnalytics, tableSort]
  );

  function handleSort(key) {
    setTableSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "building" || key === "status" ? "asc" : "desc" }
    );
  }

  // ── Headline figures ──
  const totalConsumption = filteredReadings.reduce(
    (sum, reading) => sum + reading.differential,
    0
  );
  const totalCost = totalConsumption * rate;
  const overallSpanDays = getReadingSpanDays(filteredReadings);
  const overallMonths =
    overallSpanDays >= MIN_DAYS_TO_ANNUALIZE ? overallSpanDays / DAYS_PER_MONTH : null;
  const hasPreviousWindow = Boolean(previousWindow);
  const consumptionChange =
    previousTotals && previousTotals.count > 0 && previousTotals.kwh > 0
      ? (totalConsumption - previousTotals.kwh) / previousTotals.kwh
      : null;
  const highestBuilding = buildingAnalytics.reduce(
    (highest, row) =>
      !highest || row.totalConsumption > highest.totalConsumption ? row : highest,
    null
  );
  const hasHighestBuilding = Boolean(highestBuilding && highestBuilding.totalConsumption > 0);

  // ── Reading quality ──
  const totalQualityReadings = filteredReadings.length;
  const verifiedCount = filteredReadings.filter((r) => r.is_verified).length;
  const pendingCount = totalQualityReadings - verifiedCount;
  const highAccuracyCount = filteredReadings.filter(isHighOcrAccuracy).length;
  const lowAccuracyCount = filteredReadings.filter(isLowOcrAccuracy).length;
  const scoredCount = highAccuracyCount + lowAccuracyCount;
  const manualCount = totalQualityReadings - scoredCount;
  const pieData = [
    { name: "Verified", value: verifiedCount },
    { name: "Needs Review", value: pendingCount },
  ];
  const verifiedRate = totalQualityReadings
    ? Math.round((verifiedCount / totalQualityReadings) * 100)
    : 0;
  // Out of photo readings only: a typed-in value was never scored.
  const accuracyRate = scoredCount ? Math.round((highAccuracyCount / scoredCount) * 100) : 0;

  // ── Forecast ──
  const bestMethod = forecastModel?.methods.find((m) => m.key === forecastModel.bestKey);
  const forecastPoints = forecastModel ? forecastModel.series.filter((d) => d.isForecast) : [];
  const bridgeForecastMonth = forecastModel
    ? forecastModel.series.filter((d) => !d.isForecast).at(-1)?.month
    : undefined;
  const forecastAverage = bestMethod?.projection
    ? bestMethod.projection.reduce((sum, value) => sum + value, 0) / bestMethod.projection.length
    : 0;
  const forecastChange =
    forecastModel && forecastModel.recentAverage > 0
      ? (forecastAverage - forecastModel.recentAverage) / forecastModel.recentAverage
      : 0;
  const forecastDirection =
    forecastChange > 0.03 ? "Rising" : forecastChange < -0.03 ? "Falling" : "Steady";
  const ForecastIcon =
    forecastDirection === "Rising" ? TrendingUp : forecastDirection === "Falling" ? TrendingDown : Minus;
  const trendFit = forecastModel?.trendFit ?? 0;
  const trendFitLabel = trendFit >= 0.7 ? "strong" : trendFit >= 0.4 ? "moderate" : "weak";

  // ── Appliance comparison ──
  const hasApplianceData = applianceRows.some((row) => row.applianceKwhMonth !== null);
  const applianceScaleMax = applianceRows.reduce(
    (max, row) => Math.max(max, row.monthlyConsumption || 0, row.applianceKwhMonth || 0),
    0
  );

  const formatComparisonTick = (value) =>
    comparisonMetric === "cost"
      ? `₱${formatCompact(value)}`
      : comparisonMetric === "eui"
      ? formatDecimal(value, 0)
      : formatCompact(value);

  function exportTableCsv() {
    const periodLabel =
      periodFilter === "Custom Range"
        ? `${customFrom || "start"} to ${customTo || "today"}`
        : periodFilter;
    const header = [
      "Building",
      "Meters",
      "Readings",
      "Total kWh",
      "kWh per month",
      "EUI (kWh/m²/yr)",
      "EUI annualised",
      "Estimated cost (PHP)",
      "OCR average",
      "Manual readings",
      "Verified",
      "Needs review",
      "Status",
    ];
    const rows = sortedTableRows.map((row) => [
      row.building,
      row.meterCount,
      row.readingCount,
      roundTo2(row.totalConsumption),
      row.monthlyConsumption === null ? "" : roundTo2(row.monthlyConsumption),
      row.status === "No Data" ? "" : roundTo2(row.eui),
      row.isAnnualized ? "Yes" : "No",
      roundTo2(row.estimatedCost),
      formatOcrAccuracy(row.averageAccuracy),
      row.manualCount,
      row.verifiedCount,
      row.pendingCount,
      row.status,
    ]);
    downloadCsv(`enersight-analytics-${new Date().toISOString().slice(0, 10)}.csv`, [
      [`Period: ${periodLabel}`, `Building: ${buildingFilter}`, `Status: ${statusFilter}`, `Rate: PHP ${rate}/kWh`],
      [],
      header,
      ...rows,
    ]);
  }

  const selectClass =
    "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white";

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes analyticsCardIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <PageHeader
        eyebrow="Energy Analytics"
        title="Analytics"
        subtitle="Analyze consumption trends and building performance."
        icon={BarChart3}
        status={isLoading ? "Syncing data" : `${filteredReadings.length} Records`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoading}
        intervalMs={AUTO_REFRESH_MS}
      />

      <RateNotice isFallback={isRateFallback} error={rateError} />

      {/* ── Filters ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            aria-label="Building"
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className={selectClass}
          >
            <option value="All Buildings">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.building_id} value={b.name}>{b.name}</option>
            ))}
          </select>
          <select
            aria-label="Period"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className={selectClass}
          >
            {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            aria-label="Energy status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectClass}
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={15} />
            Clear filters
          </button>
        </div>

        {periodFilter === "Custom Range" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-xs font-medium text-slate-500 sm:flex-none">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={`${selectClass} py-2.5`}
              />
            </label>
            <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-xs font-medium text-slate-500 sm:flex-none">
              To
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className={`${selectClass} py-2.5`}
              />
            </label>
            {isCustomRangeInvalid ? (
              <p className="pb-3 text-xs font-medium text-red-600">
                The start date is after the end date.
              </p>
            ) : (
              !customFrom &&
              !customTo && (
                <p className="pb-3 text-xs text-slate-400">
                  Pick a start date, an end date, or both.
                </p>
              )
            )}
          </div>
        )}
      </section>

      {/* ── Stat Cards ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Consumption"
          value={formatNumber(totalConsumption)}
          icon={Zap}
          tone="dark"
          description={
            hasPreviousWindow ? (
              <ChangeNote change={consumptionChange} label={previousLabel} />
            ) : overallMonths ? (
              `kWh · about ${formatNumber(totalConsumption / overallMonths)} kWh per month`
            ) : (
              "kWh · total from selected records"
            )
          }
          animDelay={0}
        />
        <StatCard
          title="Estimated Cost"
          value={formatPeso(totalCost, { decimals: 0 })}
          icon={Coins}
          tone="green"
          description={
            hasPreviousWindow && previousTotals?.count > 0
              ? `At ${formatPeso(rate)} / kWh · previous: ${formatPeso(previousTotals.kwh * rate, { decimals: 0 })}`
              : overallMonths && !hasPreviousWindow
              ? `About ${formatPeso(totalCost / overallMonths, { decimals: 0 })} per month · at ${formatPeso(rate)} / kWh`
              : `At ${formatPeso(rate)} / kWh · total bill estimate`
          }
          compactValue
          animDelay={60}
        />
        <StatCard
          title="Highest Building"
          value={hasHighestBuilding ? highestBuilding.building : "N/A"}
          icon={TrendingUp}
          tone={highestBuilding?.status === "Critical" ? "red" : "amber"}
          description={
            hasHighestBuilding
              ? `${formatNumber(highestBuilding.totalConsumption)} kWh · EUI ${formatEui(highestBuilding)}`
              : "No data available"
          }
          compactValue
          animDelay={120}
        />
        <StatCard
          title="Low OCR Accuracy"
          value={formatNumber(lowAccuracyCount)}
          icon={AlertTriangle}
          tone={lowAccuracyCount > 0 ? "red" : "green"}
          description={`Photo readings below 90% · ${manualCount} manual not counted`}
          animDelay={180}
        />
      </section>

      {/* ── Trend + Bar Charts ── */}
      <section className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Energy Use Trend"
          subtitle="Monthly consumption based on saved meter readings."
          animDelay={240}
        >
          <div className="h-72">
            {monthlyTrend.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No trend data yet"
                description="Monthly trends appear once meter readings are saved across two or more months."
                className="h-full"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyTrend}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#047857" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#047857" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }}
                    tickFormatter={formatCompact}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#047857", strokeWidth: 1, strokeDasharray: "4 3" }} />
                  <Area
                    type="monotone"
                    dataKey="consumption"
                    stroke="#047857"
                    strokeWidth={3}
                    fill="url(#trendAreaGrad)"
                    dot={{ r: 5, fill: "#047857", stroke: "#fff", strokeWidth: 2.5 }}
                    activeDot={{ r: 7, fill: "#047857", stroke: "#fff", strokeWidth: 2.5 }}
                    isAnimationActive
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Building Energy Comparison"
          subtitle={COMPARISON_SUBTITLES[comparisonMetric]}
          action={
            <SegmentedControl
              label="Comparison metric"
              options={COMPARISON_METRICS}
              value={comparisonMetric}
              onChange={setComparisonMetric}
            />
          }
          animDelay={300}
        >
          <div className="h-72">
            {buildingAnalytics.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No building data yet"
                description="Add buildings and record readings to compare consumption here."
                className="h-full"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={comparisonData}
                  barCategoryGap="30%"
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="barNormalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#047857" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.65} />
                    </linearGradient>
                    <linearGradient id="barHighGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.65} />
                    </linearGradient>
                    <linearGradient id="barCritGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.65} />
                    </linearGradient>
                    <linearGradient id="barNoDataGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.65} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="building"
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }}
                    tickFormatter={formatComparisonTick}
                    domain={
                      comparisonMetric === "eui"
                        ? [0, (dataMax) => Math.ceil(Math.max(dataMax, EUI_CRITICAL_THRESHOLD) * 1.15)]
                        : [0, "auto"]
                    }
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip content={<ComparisonTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)", radius: 8 }} />
                  {comparisonMetric === "eui" && (
                    <ReferenceLine
                      y={EUI_HIGH_THRESHOLD}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{ value: `High > ${EUI_HIGH_THRESHOLD}`, position: "insideTopRight", fontSize: 10, fill: "#d97706" }}
                    />
                  )}
                  {comparisonMetric === "eui" && (
                    <ReferenceLine
                      y={EUI_CRITICAL_THRESHOLD}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: `Critical > ${EUI_CRITICAL_THRESHOLD}`, position: "insideTopRight", fontSize: 10, fill: "#dc2626" }}
                    />
                  )}
                  <Bar
                    dataKey="metricValue"
                    radius={[10, 10, 0, 0]}
                    maxBarSize={52}
                    isAnimationActive
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {comparisonData.map((entry) => (
                      <Cell
                        key={entry.building_id}
                        fill={
                          entry.status === "Critical"
                            ? "url(#barCritGrad)"
                            : entry.status === "High"
                            ? "url(#barHighGrad)"
                            : entry.status === "No Data"
                            ? "url(#barNoDataGrad)"
                            : "url(#barNormalGrad)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {[
              ["bg-emerald-600", "Normal"],
              ["bg-amber-400", "High"],
              ["bg-red-500", "Critical"],
              ["bg-slate-400", "No Data"],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="text-[10px] font-medium text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </section>

      {/* ── Reading Quality ── */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 360ms both" }}
      >
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-950">Reading Quality</h2>
          <p className="mt-0.5 text-xs font-normal text-slate-400">
            Verification progress and OCR accuracy for the selected records. Typed-in
            readings have no OCR score and are counted separately.
          </p>
        </div>

        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div className="relative h-48 w-48 shrink-0">
            {totalQualityReadings === 0 ? (
              <div className="grid h-full place-items-center rounded-full border-4 border-slate-100 text-xs font-medium text-slate-300">
                No data
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-out"
                    >
                      <Cell fill="#10B981" />
                      <Cell fill="#F59E0B" />
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [`${val} readings`, name]}
                      contentStyle={{ borderRadius: 14, border: "1px solid #f1f5f9", fontSize: 11, fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter total={totalQualityReadings} label="Readings" />
              </>
            )}
          </div>

          <div className="grid w-full flex-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Verification
              </p>
              <div className="mt-1 divide-y divide-slate-100">
                <QualityCountRow color="#10B981" label="Verified" count={verifiedCount} />
                <QualityCountRow color="#F59E0B" label="Needs review" count={pendingCount} />
              </div>
              {totalQualityReadings > 0 && (
                <div className="mt-3">
                  <QualityRate label="Verified Rate" percent={verifiedRate} tone="emerald" />
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                OCR Accuracy
              </p>
              <div className="mt-1 divide-y divide-slate-100">
                <QualityCountRow color="#3b82f6" label="Photo, 90% and above" count={highAccuracyCount} />
                <QualityCountRow color="#ef4444" label="Photo, below 90%" count={lowAccuracyCount} />
                <QualityCountRow
                  color="#94a3b8"
                  hollow
                  label="Typed in manually"
                  hint="No OCR score, left out of accuracy"
                  count={manualCount}
                />
              </div>
              {scoredCount > 0 && (
                <div className="mt-3">
                  <QualityRate label="Photo Accuracy Rate" percent={accuracyRate} tone="blue" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Forecast ── */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 480ms both" }}
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <ForecastIcon size={11} />
              Forecast{forecastModel ? ` · ${forecastDirection}` : ""}
            </div>
            <h2 className="text-lg font-semibold text-slate-950">Energy Forecast</h2>
            <p className="text-xs font-normal text-slate-400">
              Predicted usage and cost based on saved meter readings.
            </p>
          </div>
          <SegmentedControl
            label="Forecast horizon"
            options={[
              { value: 3, label: "3 mo." },
              { value: 6, label: "6 mo." },
            ]}
            value={forecastHorizon}
            onChange={setForecastHorizon}
          />
        </div>

        {!forecastModel ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 py-8 text-center text-sm font-semibold text-slate-400">
            Forecasts need readings in at least 3 different months.
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Leading estimate
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{bestMethod.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {bestMethod.error !== null
                    ? `Picked because it came closest in a back-test: forecasting the last ${forecastModel.testedMonths} month${forecastModel.testedMonths === 1 ? "" : "s"} from the months before them, it was off by ${formatPercent(bestMethod.error)} on average.`
                    : "There is not enough history yet to test the estimates against real months, so the moving average leads by default."}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {forecastModel.methods.map((method) => (
                    <span
                      key={method.key}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                        method.key === forecastModel.bestKey
                          ? "border-emerald-200 bg-white text-slate-800"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: FORECAST_COLORS[method.key] }} />
                      {method.label}
                      <span className="text-slate-400">
                        {!method.available
                          ? `needs ${method.minMonths}+ months`
                          : method.error === null
                          ? `needs ${method.minMonths + 1}+ months to test`
                          : `off by ${formatPercent(method.error)}`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Trend line fit
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  R² {formatDecimal(trendFit, 2)} · {trendFitLabel}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  A straight line explains {formatPercent(trendFit)} of the month-to-month
                  change.
                  {trendFit < 0.4 && " Treat the linear trend as a rough direction, not a number."}
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {forecastPoints.map((pt, idx) => (
                <div
                  key={pt.month}
                  className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-slate-50 px-3 py-3"
                  style={{ animation: `analyticsCardIn 350ms ease-out ${idx * 60}ms both` }}
                >
                  <p className="text-[10px] font-medium text-slate-400">{pt.month}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">
                    {formatNumber(pt[forecastModel.bestKey])}
                    <span className="ml-1 text-[10px] font-normal text-slate-400">kWh</span>
                  </p>
                  <p className="text-xs font-semibold text-emerald-700">
                    {formatPeso(pt[forecastModel.bestKey] * rate, { decimals: 0 })}
                  </p>
                  <div className="mt-2 space-y-0.5">
                    {forecastModel.methods
                      .filter((method) => method.available && method.key !== forecastModel.bestKey)
                      .map((method) => (
                        <div key={method.key} className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="truncate text-slate-400">{method.label}</span>
                          <span className="font-medium tabular-nums text-slate-500">{formatNumber(pt[method.key])}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                <span className="text-[10px] font-medium text-slate-400">Actual</span>
              </div>
              {forecastModel.methods
                .filter((method) => method.available)
                .map((method) => (
                  <div key={method.key} className="flex items-center gap-1.5">
                    <span
                      className="block h-0 w-5"
                      style={{
                        borderTop: `${method.key === forecastModel.bestKey ? 2.5 : 2}px dashed ${FORECAST_COLORS[method.key]}`,
                      }}
                    />
                    <span className="text-[10px] font-medium text-slate-400">
                      {method.label}
                      {method.key === forecastModel.bestKey ? " (leading)" : ""}
                    </span>
                  </div>
                ))}
              {bridgeForecastMonth && (
                <span className="ml-auto rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-600">
                  Predicted from {bridgeForecastMonth}
                </span>
              )}
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={forecastModel.series}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="analyticsForecastBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={36}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }}
                    tickFormatter={formatCompact}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    content={<ForecastTooltip model={forecastModel} />}
                    cursor={{ fill: "rgba(16,185,129,0.04)" }}
                  />
                  {bridgeForecastMonth && (
                    <ReferenceLine
                      x={bridgeForecastMonth}
                      stroke="#cbd5e1"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  <Bar
                    dataKey="actual"
                    fill="url(#analyticsForecastBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                  {forecastModel.methods
                    .filter((method) => method.available)
                    .map((method) => {
                      const isBest = method.key === forecastModel.bestKey;
                      return (
                        <Line
                          key={method.key}
                          type="monotone"
                          dataKey={method.key}
                          name={method.label}
                          stroke={FORECAST_COLORS[method.key]}
                          strokeWidth={isBest ? 2.5 : 1.75}
                          strokeOpacity={isBest ? 1 : 0.7}
                          strokeDasharray={isBest ? "7 4" : "3 3"}
                          dot={{ r: isBest ? 3.5 : 2.5, fill: FORECAST_COLORS[method.key], stroke: "#fff", strokeWidth: 2 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                          isAnimationActive
                          animationDuration={850}
                          animationEasing="ease-out"
                        />
                      );
                    })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-3 text-[10px] font-normal leading-4 text-slate-400">
              Moving average: mean of the last 3 months. Linear trend: a straight line
              through every month. Same month last year: last year&apos;s figure for that
              month, scaled by how recent months compare with a year earlier. Costs use{" "}
              {formatPeso(rate)} per kWh.
            </p>
          </>
        )}
      </section>

      {/* ── Priority Insights ── */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 540ms both" }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-lime-300">
            <Lightbulb size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Priority Insights</h2>
            <p className="text-xs font-normal text-slate-400">
              Buildings to look at first: worst energy status, then highest energy intensity.
            </p>
          </div>
        </div>

        {priorityInsights.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="No insights yet"
            description="Insights are generated from saved readings. Record a few and recommendations will appear here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {priorityInsights.map((row, idx) => (
              <div
                key={row.building_id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"
                style={{ animation: `analyticsCardIn 350ms ease-out ${idx * 80}ms both` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{row.building}</p>
                    <p className="mt-0.5 text-xs font-normal text-slate-400">
                      EUI {formatEui(row)}
                      {row.status !== "No Data" && " kWh/m²/yr"} · {formatNumber(row.totalConsumption)} kWh ·{" "}
                      {formatPeso(row.estimatedCost, { decimals: 0 })}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${getStatusStyle(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                <p className="text-xs font-normal leading-5 text-slate-500">
                  {getRecommendation(row)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Measured vs Appliance Estimate ── */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 570ms both" }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-700 text-white">
            <Plug size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Measured vs Appliance Estimate</h2>
            <p className="text-xs font-normal text-slate-400">
              What each meter recorded per month, next to what the building&apos;s appliance
              list says it should use.
            </p>
          </div>
        </div>

        {applianceError ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
            {applianceError} The rest of this page is unaffected.
          </div>
        ) : !hasApplianceData ? (
          <EmptyState
            icon={Plug}
            title="No appliance lists yet"
            description="Add appliances to a building on the Buildings page to compare what it should use with what its meter measured."
          />
        ) : (
          <>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
              {applianceRows.map((row) => {
                const verdict = getApplianceVerdict(row);
                return (
                  <div
                    key={row.building_id}
                    className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_1.7fr_0.5fr_1.6fr] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{row.building}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{row.status}</p>
                    </div>
                    <div className="space-y-1.5">
                      <GapBar label="Measured" value={row.monthlyConsumption} max={applianceScaleMax} fillClass="bg-emerald-600" />
                      <GapBar label="Estimate" value={row.applianceKwhMonth} max={applianceScaleMax} fillClass="bg-slate-400" />
                    </div>
                    <div>
                      {verdict.badge && row.gap !== null ? (
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${verdict.badge}`}>
                          {row.gap > 0 ? "+" : ""}
                          {Math.round(row.gap * 100)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{verdict.text}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-400">
              Estimate: watts × quantity × hours per day × days per month ÷ 1000, summed
              over the building&apos;s appliance list. Measured: meter consumption in the
              selected period, scaled to an average month. Differences over{" "}
              {formatPercent(APPLIANCE_GAP_TOLERANCE)} are flagged.
            </p>
          </>
        )}
      </section>

      {/* ── Building Analytics Table ── */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 600ms both" }}
      >
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Building Analytics Table</h2>
            <p className="mt-0.5 text-xs font-normal text-slate-400">
              Consumption, energy intensity, OCR accuracy, and verification. Click a column
              to sort.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
              <BarChart3 size={14} />
              {buildingAnalytics.length} buildings shown
            </div>
            <button
              type="button"
              onClick={exportTableCsv}
              disabled={sortedTableRows.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[1.4fr_0.6fr_0.7fr_0.95fr_0.95fr_0.75fr_0.9fr_0.75fr_0.8fr] bg-slate-50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              <div><SortHeader label="Building" sortKey="building" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="Meters" sortKey="meterCount" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="Readings" sortKey="readingCount" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="Total" sortKey="totalConsumption" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="Per Month" sortKey="monthlyConsumption" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="EUI" sortKey="eui" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="Est. Cost" sortKey="estimatedCost" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="OCR Avg." sortKey="averageAccuracy" sort={tableSort} onSort={handleSort} /></div>
              <div><SortHeader label="Status" sortKey="status" sort={tableSort} onSort={handleSort} /></div>
            </div>

            {isLoading && buildings.length === 0 ? (
              <SkeletonRows columns={ANALYTICS_ROW_COLUMNS} rows={5} />
            ) : sortedTableRows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No analytics data"
                description="Analytics are calculated from saved meter readings. Record readings to populate this table."
                className="m-4"
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedTableRows.map((row) => (
                  <div
                    key={row.building_id}
                    className="grid grid-cols-[1.4fr_0.6fr_0.7fr_0.95fr_0.95fr_0.75fr_0.9fr_0.75fr_0.8fr] items-center px-4 py-4 text-sm transition hover:bg-slate-50/60"
                  >
                    <div>
                      <p className="font-semibold text-slate-950">{row.building}</p>
                      <p className="mt-0.5 text-[11px] font-normal text-slate-400">
                        {row.verifiedCount} verified · {row.pendingCount} review
                        {row.manualCount > 0 && ` · ${row.manualCount} manual`}
                      </p>
                    </div>
                    <div className="font-semibold text-slate-700">{row.meterCount}</div>
                    <div className="font-semibold text-slate-700">{row.readingCount}</div>
                    <div className="font-semibold text-slate-950">
                      {formatNumber(row.totalConsumption)} kWh
                    </div>
                    <div className="font-medium text-slate-600">
                      {row.monthlyConsumption === null ? "—" : `${formatNumber(row.monthlyConsumption)} kWh`}
                    </div>
                    <div className="font-semibold text-slate-950">
                      {formatEui(row)}
                      {row.status !== "No Data" && (
                        <span className="ml-1 text-[10px] font-normal text-slate-400">
                          {row.isAnnualized ? "/yr" : "*"}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-emerald-700">
                      {formatPeso(row.estimatedCost, { decimals: 0 })}
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getAccuracyStyle(row.averageAccuracy)}`}>
                        {formatOcrAccuracy(row.averageAccuracy)}
                      </span>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getStatusStyle(row.status)}`}>
                        {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-4 text-slate-400">
          EUI is kWh per m² per year. * Readings cover under {MIN_DAYS_TO_ANNUALIZE} days, so
          the figure is for the period only. Per month scales the period&apos;s consumption to
          an average month.
        </p>
      </section>
    </div>
  );
};

export default Analytics;
