import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Gauge,
  Lightbulb,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
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
const AUTO_REFRESH_MS = 60000;

const periodOptions = ["All Time", "This Month", "Last Month", "This Year"];
const statusOptions = ["All Status", "Normal", "High", "Critical"];

function normalizeBuilding(building) {
  return {
    building_id: building.building_id,
    name: building.name || "",
    status: building.status || "Active",
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
    image_path: reading.image_path || "No image attached",
    ocr_accuracy: Number(reading.ocr_accuracy || 0),
    is_verified: Boolean(reading.is_verified),
  };
}

function formatNumber(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return "0";
  return Math.round(numericValue).toLocaleString();
}

function isReadingInPeriod(readingDate, period) {
  if (period === "All Time") return true;
  if (!readingDate) return false;
  const date = new Date(readingDate);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const sameMonth =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sameLastMonth =
    date.getFullYear() === lastMonthDate.getFullYear() &&
    date.getMonth() === lastMonthDate.getMonth();
  const sameYear = date.getFullYear() === now.getFullYear();
  if (period === "This Month") return sameMonth;
  if (period === "Last Month") return sameLastMonth;
  if (period === "This Year") return sameYear;
  return true;
}

function getConsumptionStatus(total) {
  if (Number(total) >= 5000) return "Critical";
  if (Number(total) >= 2500) return "High";
  return "Normal";
}

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
  if (Number(accuracy) >= 90)
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (Number(accuracy) >= 80)
    return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-red-100 bg-red-50 text-red-700";
}

function getMonthKey(readingDate) {
  if (!readingDate) return "Unknown";
  const date = new Date(readingDate);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function getRecommendation(row) {
  if (row.status === "Critical")
    return "Immediate review recommended. Check equipment usage, schedule, and meter readings.";
  if (row.status === "High")
    return "Monitor this building closely and compare with previous readings.";
  if (row.averageAccuracy < 90 && row.readingCount > 0)
    return "OCR accuracy needs checking. Verify meter photos before reporting.";
  if (row.pendingCount > 0)
    return "Some readings still need manual verification.";
  return "Consumption and reading quality are within normal monitoring range.";
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  tone = "dark",
  description,
  compactValue = false,
  animDelay = 0,
}) {
  const palette = {
    green:  { bg: "border-emerald-100 bg-emerald-50", title: "text-emerald-700", value: "text-emerald-800", icon: "bg-emerald-700 text-white" },
    blue:   { bg: "border-blue-100 bg-blue-50",       title: "text-blue-700",    value: "text-blue-800",    icon: "bg-blue-600 text-white" },
    amber:  { bg: "border-amber-100 bg-amber-50",     title: "text-amber-700",   value: "text-amber-800",   icon: "bg-amber-500 text-white" },
    red:    { bg: "border-red-100 bg-red-50",         title: "text-red-700",     value: "text-red-800",     icon: "bg-red-500 text-white" },
    dark:   { bg: "border-slate-200 bg-white",        title: "text-slate-500",   value: "text-slate-950",   icon: "bg-slate-950 text-lime-300" },
  };
  const c = palette[tone] ?? palette.dark;

  return (
    <div
      className={`rounded-[1.7rem] border p-5 shadow-sm ${c.bg}`}
      style={{ animation: `analyticsCardIn 420ms ease-out ${animDelay}ms both` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className={`text-sm font-black ${c.title}`}>{title}</p>
          <p className={`mt-2 font-black leading-none ${c.value} ${compactValue ? "text-xl xl:text-2xl" : "text-3xl"}`}>
            {value}
          </p>
        </div>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${c.icon}`}>
          <Icon size={23} />
        </div>
      </div>
      <p className={`text-xs font-bold ${c.title}`}>{description}</p>
    </div>
  );
}

// ─── Chart Card ──────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, animDelay = 0 }) {
  return (
    <div
      className="flex flex-col rounded-[1.7rem] border border-slate-200 bg-white p-6 shadow-sm"
      style={{ animation: `analyticsCardIn 420ms ease-out ${animDelay}ms both` }}
    >
      <div className="mb-5">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-0.5 text-xs font-bold text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ─── Custom Tooltips ─────────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-base font-black text-emerald-700">
        {formatNumber(payload[0]?.value)} <span className="text-xs font-bold">kWh</span>
      </p>
    </div>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="min-w-[160px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-base font-black text-slate-950">
        {formatNumber(payload[0]?.value)} <span className="text-xs font-bold text-slate-500">kWh</span>
      </p>
      {data && (
        <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${getStatusStyle(data.status)}`}>
          {data.status}
        </span>
      )}
    </div>
  );
}

// ─── Prediction Utilities ─────────────────────────────────────────────────────

const ALL_MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getNextMonthLabelsAnalytics(lastMonthLabel, count) {
  const shortName = lastMonthLabel.split(" ")[0];
  const idx = ALL_MONTHS_SHORT.indexOf(shortName);
  if (idx === -1) return Array.from({ length: count }, (_, i) => `M+${i + 1}`);
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const nextIdx = (idx + 1 + i) % 12;
    const yearOffset = Math.floor((idx + 1 + i) / 12);
    const year = now.getFullYear() + yearOffset;
    return `${ALL_MONTHS_SHORT[nextIdx]} ${year}`;
  });
}

function computeMovingAvgForecastA(values, windowSize = 3, horizon = 3) {
  const valid = values.filter((v) => v > 0);
  if (valid.length === 0) return Array(horizon).fill(0);
  const w = Math.min(windowSize, valid.length);
  const slice = valid.slice(-w);
  const avg = Math.round(slice.reduce((s, v) => s + v, 0) / w);
  return Array(horizon).fill(avg);
}

function computeLinearForecastA(values, horizon = 3) {
  const valid = values.filter((v) => v > 0);
  const n = valid.length;
  if (n === 0) return Array(horizon).fill(0);
  if (n === 1) return Array(horizon).fill(Math.round(valid[0]));
  const x = valid.map((_, i) => i);
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = valid.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * valid[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return Array(horizon).fill(Math.round(valid[0]));
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return Array.from({ length: horizon }, (_, i) =>
    Math.max(0, Math.round(intercept + slope * (n + i)))
  );
}

function buildAnalyticsForecastData(monthlyTrend, horizon) {
  if (monthlyTrend.length === 0) return [];
  const values = monthlyTrend.map((d) => d.consumption);
  const maForecast = computeMovingAvgForecastA(values, 3, horizon);
  const linearForecast = computeLinearForecastA(values, horizon);
  const lastPoint = monthlyTrend[monthlyTrend.length - 1];
  const futureLabels = getNextMonthLabelsAnalytics(lastPoint.month, horizon);
  const historical = monthlyTrend.map((d, idx) => ({
    month: d.month,
    actual: d.consumption,
    ma: idx === monthlyTrend.length - 1 ? maForecast[0] : null,
    linear: idx === monthlyTrend.length - 1 ? linearForecast[0] : null,
    isForecast: false,
  }));
  const forecast = futureLabels.map((month, i) => ({
    month,
    actual: null,
    ma: maForecast[i],
    linear: linearForecast[i],
    isForecast: true,
  }));
  return [...historical, ...forecast];
}

function ForecastTooltip({ active, payload, label, chartData }) {
  if (!active || !payload || payload.length === 0) return null;
  const isForecast = chartData.find((d) => d.month === label)?.isForecast;
  return (
    <div className="min-w-[170px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
        {isForecast && (
          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 normal-case">
            Forecast
          </span>
        )}
      </p>
      {payload.map(
        (entry) =>
          entry.value !== null && (
            <p key={entry.name} style={{ color: entry.color }} className="mt-1 text-xs font-black">
              {entry.name === "actual"
                ? "Historical"
                : entry.name === "ma"
                ? "Moving Avg."
                : "Linear Trend"}
              : {formatNumber(entry.value)} kWh
            </p>
          )
      )}
    </div>
  );
}

// ─── Donut Center Label ───────────────────────────────────────────────────────

function DonutCenter({ total, label }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <p className="text-2xl font-black text-slate-950 leading-none">{total}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const Analytics = () => {
  const [buildings, setBuildings] = useState([]);
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [buildingFilter, setBuildingFilter] = useState("All Buildings");
  const [periodFilter, setPeriodFilter] = useState("All Time");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [forecastHorizon, setForecastHorizon] = useState(3);

  const trendSectionRef = useRef(null);
  const ocrSectionRef = useRef(null);
  const insightsSectionRef = useRef(null);
  const forecastSectionRef = useRef(null);

  function scrollToSection(ref) {
    if (!ref.current) return;
    const topbarOffset = 145;
    const elementTop = ref.current.getBoundingClientRect().top;
    const scrollPosition = window.scrollY + elementTop - topbarOffset;
    window.scrollTo({ top: scrollPosition, behavior: "smooth" });
  }

  const metersById = useMemo(
    () => new Map(meters.map((m) => [Number(m.meter_id), m])),
    [meters]
  );

  const buildingsById = useMemo(
    () => new Map(buildings.map((b) => [Number(b.building_id), b])),
    [buildings]
  );

  function getBuildingName(buildingId) {
    return buildingsById.get(Number(buildingId))?.name || "Unknown building";
  }

  function getMeter(meterId) {
    return metersById.get(Number(meterId));
  }

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

  async function refreshData(showSuccessMessage = false) {
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const [buildingData, meterData, readingData] = await Promise.all([
        fetchBuildings(),
        fetchMeters(),
        fetchReadings(),
      ]);
      setBuildings(buildingData);
      setMeters(meterData);
      setReadings(readingData);
      if (showSuccessMessage) setSuccessMessage("Analytics data refreshed successfully.");
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
    () => refreshData(false),
    { intervalMs: AUTO_REFRESH_MS }
  );

  const filteredReadings = useMemo(() => {
    return readings.filter((reading) => {
      const meter = getMeter(reading.meter_id);
      const buildingName = meter ? getBuildingName(meter.building_id) : "";
      const meterSerial = meter?.serial_no || "";
      const searchValue = query.toLowerCase();
      const matchesBuilding =
        buildingFilter === "All Buildings" || buildingName === buildingFilter;
      const matchesPeriod = isReadingInPeriod(reading.reading_date, periodFilter);
      const matchesSearch =
        String(reading.record_id).includes(searchValue) ||
        String(reading.reading_value).includes(searchValue) ||
        String(reading.ocr_accuracy).includes(searchValue) ||
        meterSerial.toLowerCase().includes(searchValue) ||
        buildingName.toLowerCase().includes(searchValue) ||
        reading.image_path.toLowerCase().includes(searchValue);
      return matchesBuilding && matchesPeriod && matchesSearch;
    });
  }, [readings, meters, buildings, buildingFilter, periodFilter, query]);

  const buildingAnalytics = useMemo(() => {
    return buildings
      .map((building) => {
        const buildingMeters = meters.filter(
          (meter) => Number(meter.building_id) === Number(building.building_id)
        );
        const meterIds = buildingMeters.map((meter) => Number(meter.meter_id));
        const buildingReadings = filteredReadings.filter((reading) =>
          meterIds.includes(Number(reading.meter_id))
        );
        const totalConsumption = buildingReadings.reduce(
          (sum, reading) => sum + reading.differential,
          0
        );
        const averageReading = buildingReadings.length
          ? Math.round(totalConsumption / buildingReadings.length)
          : 0;
        const highestReading = buildingReadings.length
          ? Math.max(...buildingReadings.map((r) => r.differential))
          : 0;
        const averageAccuracy = buildingReadings.length
          ? Math.round(
              buildingReadings.reduce((sum, r) => sum + Number(r.ocr_accuracy || 0), 0) /
                buildingReadings.length
            )
          : 0;
        const verifiedCount = buildingReadings.filter((r) => r.is_verified).length;
        const pendingCount = buildingReadings.filter((r) => !r.is_verified).length;
        const status = getConsumptionStatus(totalConsumption);
        return {
          building_id: building.building_id,
          building: building.name,
          meterCount: buildingMeters.length,
          readingCount: buildingReadings.length,
          totalConsumption,
          averageReading,
          highestReading,
          averageAccuracy,
          verifiedCount,
          pendingCount,
          status,
        };
      })
      .filter((row) => {
        const matchesStatus = statusFilter === "All Status" || row.status === statusFilter;
        const matchesBuilding =
          buildingFilter === "All Buildings" || row.building === buildingFilter;
        return matchesStatus && matchesBuilding;
      })
      .sort((a, b) => b.totalConsumption - a.totalConsumption);
  }, [buildings, meters, filteredReadings, statusFilter, buildingFilter]);

  const monthlyTrend = useMemo(() => {
    const grouped = {};
    filteredReadings.forEach((reading) => {
      const monthKey = getMonthKey(reading.reading_date);
      if (!grouped[monthKey]) {
        grouped[monthKey] = { month: monthKey, consumption: 0, readings: 0 };
      }
      grouped[monthKey].consumption += reading.differential;
      grouped[monthKey].readings += 1;
    });
    return Object.values(grouped);
  }, [filteredReadings]);

  const totalConsumption = filteredReadings.reduce(
    (sum, reading) => sum + reading.differential,
    0
  );
  const averageReading = filteredReadings.length
    ? Math.round(totalConsumption / filteredReadings.length)
    : 0;
  const highestBuilding = buildingAnalytics[0];
  const lowAccuracyCount = filteredReadings.filter(
    (r) => Number(r.ocr_accuracy) < 90
  ).length;
  const verifiedCount = filteredReadings.filter((r) => r.is_verified).length;
  const pendingCount = filteredReadings.filter((r) => !r.is_verified).length;
  const highAccuracyCount = filteredReadings.filter(
    (r) => Number(r.ocr_accuracy) >= 90
  ).length;

  const pieData = [
    { name: "Verified", value: verifiedCount },
    { name: "Needs Review", value: pendingCount },
  ];
  const ocrPieData = [
    { name: "High Accuracy", value: highAccuracyCount },
    { name: "Needs Checking", value: lowAccuracyCount },
  ];
  const priorityInsights = buildingAnalytics.slice(0, 3);

  const forecastChartData = useMemo(
    () => buildAnalyticsForecastData(monthlyTrend, forecastHorizon),
    [monthlyTrend, forecastHorizon]
  );
  const forecastPoints = forecastChartData.filter((d) => d.isForecast);
  const bridgeForecastMonth = forecastChartData.find(
    (d) => !d.isForecast && d.ma !== null
  )?.month;

  return (
    <div className="space-y-5 font-[Nunito]">
      <style>{`
        @keyframes analyticsCardIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes analyticsChartIn {
          from { opacity: 0; transform: translateY(16px); }
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
        actions={
          <>
            <button
              type="button"
              onClick={() => scrollToSection(insightsSectionRef)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white/25"
            >
              <ShieldCheck size={15} />
              Insights
            </button>
            <button
              type="button"
              onClick={() => scrollToSection(forecastSectionRef)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white/25"
            >
              <TrendingDown size={15} />
              Forecast
            </button>
            <button
              type="button"
              onClick={() => scrollToSection(ocrSectionRef)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white/25"
            >
              <Gauge size={15} />
              OCR
            </button>
            <button
              type="button"
              onClick={() => scrollToSection(trendSectionRef)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
            >
              <TrendingUp size={15} />
              Trends
            </button>
          </>
        }
      />

      {/* ── Filters ── */}
      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
            {successMessage}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            <option value="All Buildings">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.building_id} value={b.name}>{b.name}</option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search building, meter, reading..."
              className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      </section>

      {/* ── Stat Cards ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Consumption"
          value={formatNumber(totalConsumption)}
          icon={Zap}
          tone="dark"
          description="kWh · total from selected records"
          animDelay={0}
        />
        <StatCard
          title="Average Reading"
          value={formatNumber(averageReading)}
          icon={Calendar}
          tone="blue"
          description="kWh · average per reading"
          animDelay={60}
        />
        <StatCard
          title="Highest Building"
          value={highestBuilding?.building || "N/A"}
          icon={TrendingUp}
          tone={highestBuilding?.status === "Critical" ? "red" : "amber"}
          description={
            highestBuilding
              ? `${formatNumber(highestBuilding.totalConsumption)} kWh total`
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
          description="Readings below 90% accuracy"
          animDelay={180}
        />
      </section>

      {/* ── Trend + Bar Charts ── */}
      <section
        ref={trendSectionRef}
        className="scroll-mt-36 grid gap-5 lg:grid-cols-2"
      >
        {/* Energy Use Trend */}
        <ChartCard
          title="Energy Use Trend"
          subtitle="Monthly consumption based on saved meter readings."
          animDelay={240}
        >
          <div className="h-72">
            {monthlyTrend.length === 0 ? (
              <div className="grid h-full place-items-center rounded-2xl border border-slate-100 bg-slate-50 text-sm font-black text-slate-400">
                No trend data available yet.
              </div>
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
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
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

        {/* Building Energy Comparison */}
        <ChartCard
          title="Building Energy Comparison"
          subtitle="Total energy consumption by building."
          animDelay={300}
        >
          <div className="h-72">
            {buildingAnalytics.length === 0 ? (
              <div className="grid h-full place-items-center rounded-2xl border border-slate-100 bg-slate-50 text-sm font-black text-slate-400">
                No building data available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={buildingAnalytics}
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
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="building"
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)", radius: 8 }} />
                  <Bar
                    dataKey="totalConsumption"
                    radius={[10, 10, 0, 0]}
                    maxBarSize={52}
                    isAnimationActive
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {buildingAnalytics.map((entry) => (
                      <Cell
                        key={entry.building_id}
                        fill={
                          entry.status === "Critical"
                            ? "url(#barCritGrad)"
                            : entry.status === "High"
                            ? "url(#barHighGrad)"
                            : "url(#barNormalGrad)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              <span className="text-[10px] font-black text-slate-400">Normal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-black text-slate-400">High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-[10px] font-black text-slate-400">Critical</span>
            </div>
          </div>
        </ChartCard>
      </section>

      {/* ── Verification + OCR Donut Charts ── */}
      <section
        ref={ocrSectionRef}
        className="scroll-mt-36 grid gap-5 lg:grid-cols-2"
      >
        {/* Verification Summary */}
        <ChartCard
          title="Verification Summary"
          subtitle="Verified readings compared with readings that need review."
          animDelay={360}
        >
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
            {/* Donut */}
            <div className="relative h-48 w-48 shrink-0">
              {pieData.every((d) => d.value === 0) ? (
                <div className="grid h-full place-items-center rounded-full border-4 border-slate-100 text-xs font-black text-slate-300">
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
                        contentStyle={{ borderRadius: 14, border: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <DonutCenter total={verifiedCount + pendingCount} label="Total" />
                </>
              )}
            </div>

            {/* Stats */}
            <div className="flex flex-1 flex-col gap-3 w-full">
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
                <div className="flex-1">
                  <p className="text-xs font-black text-emerald-600">Verified Readings</p>
                </div>
                <p className="text-2xl font-black text-emerald-800">{verifiedCount}</p>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full bg-amber-400" />
                <div className="flex-1">
                  <p className="text-xs font-black text-amber-600">Needs Review</p>
                </div>
                <p className="text-2xl font-black text-amber-800">{pendingCount}</p>
              </div>
              {(verifiedCount + pendingCount) > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Verified Rate</span>
                    <span className="text-sm font-black text-emerald-700">
                      {Math.round((verifiedCount / (verifiedCount + pendingCount)) * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                      style={{ width: `${Math.round((verifiedCount / (verifiedCount + pendingCount)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ChartCard>

        {/* OCR Accuracy Summary */}
        <ChartCard
          title="OCR Accuracy Summary"
          subtitle="High-accuracy records versus readings that need checking."
          animDelay={420}
        >
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
            {/* Donut */}
            <div className="relative h-48 w-48 shrink-0">
              {ocrPieData.every((d) => d.value === 0) ? (
                <div className="grid h-full place-items-center rounded-full border-4 border-slate-100 text-xs font-black text-slate-300">
                  No data
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ocrPieData}
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
                        <Cell fill="#2563EB" />
                        <Cell fill="#EF4444" />
                      </Pie>
                      <Tooltip
                        formatter={(val, name) => [`${val} records`, name]}
                        contentStyle={{ borderRadius: 14, border: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <DonutCenter total={highAccuracyCount + lowAccuracyCount} label="Total" />
                </>
              )}
            </div>

            {/* Stats */}
            <div className="flex flex-1 flex-col gap-3 w-full">
              <div className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full bg-blue-500" />
                <div className="flex-1">
                  <p className="text-xs font-black text-blue-600">High Accuracy</p>
                  <p className="text-[10px] font-bold text-blue-400">90% and above</p>
                </div>
                <p className="text-2xl font-black text-blue-800">{highAccuracyCount}</p>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
                <div className="flex-1">
                  <p className="text-xs font-black text-red-600">Needs Checking</p>
                  <p className="text-[10px] font-bold text-red-400">Below 90%</p>
                </div>
                <p className="text-2xl font-black text-red-800">{lowAccuracyCount}</p>
              </div>
              {(highAccuracyCount + lowAccuracyCount) > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accuracy Rate</span>
                    <span className="text-sm font-black text-blue-700">
                      {Math.round((highAccuracyCount / (highAccuracyCount + lowAccuracyCount)) * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-700"
                      style={{ width: `${Math.round((highAccuracyCount / (highAccuracyCount + lowAccuracyCount)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ChartCard>
      </section>

      {/* ── Forecast ── */}
      <section
        ref={forecastSectionRef}
        className="scroll-mt-36 rounded-[1.7rem] border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 480ms both" }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
              <TrendingDown size={11} />
              Forecast
            </div>
            <h2 className="text-lg font-black text-slate-950">Energy Forecast</h2>
            <p className="text-xs font-bold text-slate-400">Predicted usage based on saved meter readings.</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {[3, 6].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setForecastHorizon(h)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                  forecastHorizon === h
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {h} mo.
              </button>
            ))}
          </div>
        </div>

        {forecastChartData.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 py-8 text-center text-sm font-black text-slate-400">
            Add more meter readings to see predictions.
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {forecastPoints.map((pt, idx) => (
                <div
                  key={pt.month}
                  className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-slate-50 px-3 py-3"
                  style={{ animation: `analyticsCardIn 350ms ease-out ${idx * 60}ms both` }}
                >
                  <p className="text-[10px] font-black text-slate-400">{pt.month}</p>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Avg.</span>
                      <span className="text-[11px] font-black text-slate-800">{formatNumber(pt.ma)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Trend</span>
                      <span className="text-[11px] font-black text-slate-500">{formatNumber(pt.linear)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                <span className="text-[10px] font-black text-slate-400">Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="block h-0 w-5" style={{ borderTop: "2px dashed #059669" }} />
                <span className="text-[10px] font-black text-slate-400">Avg. Estimate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="block h-0 w-5" style={{ borderTop: "2px dashed #94a3b8" }} />
                <span className="text-[10px] font-black text-slate-400">Trend Estimate</span>
              </div>
              {bridgeForecastMonth && (
                <span className="ml-auto rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-600">
                  Predicted from {bridgeForecastMonth}
                </span>
              )}
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={forecastChartData}
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
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={36}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    content={<ForecastTooltip chartData={forecastChartData} />}
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
                  <Line
                    type="monotone"
                    dataKey="ma"
                    stroke="#059669"
                    strokeWidth={2}
                    strokeDasharray="7 4"
                    dot={{ r: 3.5, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive
                    animationDuration={850}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="linear"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 3.5, fill: "#94a3b8", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive
                    animationDuration={1050}
                    animationEasing="ease-out"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-3 text-[10px] font-bold leading-4 text-slate-400">
              Based on saved meter readings. Avg. uses last 3 months · Trend follows usage direction.
            </p>
          </>
        )}
      </section>

      {/* ── Priority Insights ── */}
      <section
        ref={insightsSectionRef}
        className="scroll-mt-36 rounded-[1.7rem] border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 540ms both" }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-lime-300">
            <Lightbulb size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Priority Insights</h2>
            <p className="text-xs font-bold text-slate-400">
              Buildings that need attention based on consumption and reading quality.
            </p>
          </div>
        </div>

        {priorityInsights.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-8 text-center text-sm font-black text-slate-400">
            No insights available yet. Add readings first.
          </div>
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
                    <p className="truncate font-black text-slate-950">{row.building}</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-400">
                      {formatNumber(row.totalConsumption)} kWh total
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${getStatusStyle(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                <p className="text-xs font-bold leading-5 text-slate-500">
                  {getRecommendation(row)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Building Analytics Table ── */}
      <section
        className="rounded-[1.7rem] border border-slate-200 bg-white p-6 shadow-sm"
        style={{ animation: "analyticsCardIn 420ms ease-out 600ms both" }}
      >
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Building Analytics Table</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-400">
              Consumption, OCR accuracy, and verification summary.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700">
            <BarChart3 size={14} />
            {buildingAnalytics.length} buildings shown
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[1.25fr_0.7fr_0.8fr_1fr_1fr_1fr_0.9fr_0.9fr] bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              <div>Building</div>
              <div>Meters</div>
              <div>Readings</div>
              <div>Total</div>
              <div>Average</div>
              <div>Highest</div>
              <div>OCR Avg.</div>
              <div>Status</div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-sm font-black text-slate-400">
                Loading analytics...
              </div>
            ) : buildingAnalytics.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-400">
                No analytics data found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {buildingAnalytics.map((row) => (
                  <div
                    key={row.building_id}
                    className="grid grid-cols-[1.25fr_0.7fr_0.8fr_1fr_1fr_1fr_0.9fr_0.9fr] items-center px-4 py-4 text-sm transition hover:bg-slate-50/60"
                  >
                    <div>
                      <p className="font-black text-slate-950">{row.building}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                        {row.verifiedCount} verified · {row.pendingCount} review
                      </p>
                    </div>
                    <div className="font-black text-slate-700">{row.meterCount}</div>
                    <div className="font-black text-slate-700">{row.readingCount}</div>
                    <div className="font-black text-slate-950">
                      {formatNumber(row.totalConsumption)} kWh
                    </div>
                    <div className="font-bold text-slate-600">
                      {formatNumber(row.averageReading)} kWh
                    </div>
                    <div className="font-bold text-slate-600">
                      {formatNumber(row.highestReading)} kWh
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-black ${getAccuracyStyle(row.averageAccuracy)}`}>
                        {row.averageAccuracy}%
                      </span>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-black ${getStatusStyle(row.status)}`}>
                        {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Analytics;
