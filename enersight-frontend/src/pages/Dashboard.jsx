import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  FileDown,
  FileText,
  Gauge,
  Map,
  MapPinned,
  ScanLine,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
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
    ocr_accuracy: Number(reading.ocr_accuracy || 0),
    is_verified: Boolean(reading.is_verified),
  };
}

function formatNumber(value) {
  const number = Number(value || 0);

  if (Number.isNaN(number)) {
    return "0";
  }

  return Math.round(number).toLocaleString();
}

function formatCompact(value) {
  const number = Number(value || 0);

  if (Number.isNaN(number)) {
    return "0";
  }

  if (number >= 1000000) {
    return `${(number / 1000000).toFixed(1)}M`;
  }

  if (number >= 1000) {
    return `${(number / 1000).toFixed(1)}K`;
  }

  return Math.round(number).toLocaleString();
}

function formatDecimal(value) {
  const number = Number(value || 0);

  if (Number.isNaN(number)) {
    return "0.00";
  }

  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function getMonthName(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-US", {
    month: "short",
  });
}

function computeEui(consumption, floorArea) {
  const totalConsumption = Number(consumption || 0);
  const area = Number(floorArea || 0);

  if (totalConsumption <= 0 || area <= 0) {
    return 0;
  }

  return totalConsumption / area;
}

function getEnergyStatus(consumption, floorArea) {
  const eui = computeEui(consumption, floorArea);

  if (Number(consumption || 0) <= 0 || Number(floorArea || 0) <= 0) {
    return "No Data";
  }

  if (eui > 20) {
    return "Critical";
  }

  if (eui > 10) {
    return "High";
  }

  return "Normal";
}

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

function getMapMarkerStyle(status) {
  if (status === "Normal") {
    return {
      shell: "bg-emerald-600 text-white shadow-emerald-900/30",
      glow: "bg-emerald-400/35",
      pulse: "border-emerald-300/70",
    };
  }

  if (status === "High") {
    return {
      shell: "bg-amber-500 text-white shadow-amber-900/30",
      glow: "bg-amber-300/40",
      pulse: "border-amber-300/80",
    };
  }

  if (status === "Critical") {
    return {
      shell: "bg-red-500 text-white shadow-red-900/35",
      glow: "bg-red-400/45",
      pulse: "border-red-300/80",
    };
  }

  return {
    shell: "bg-slate-500 text-white shadow-slate-900/20",
    glow: "bg-slate-300/35",
    pulse: "border-slate-300/70",
  };
}

// ─── Prediction Utilities ────────────────────────────────────────────────────

const ALL_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getNextMonthLabels(lastMonthLabel, count) {
  const idx = ALL_MONTHS.indexOf(lastMonthLabel);
  if (idx === -1) return ALL_MONTHS.slice(0, count);
  return Array.from({ length: count }, (_, i) => ALL_MONTHS[(idx + 1 + i) % 12]);
}

function computeMovingAvgForecast(values, windowSize = 3, horizon = 3) {
  const valid = values.filter((v) => v > 0);
  if (valid.length === 0) return Array(horizon).fill(0);
  const w = Math.min(windowSize, valid.length);
  const slice = valid.slice(-w);
  const avg = Math.round(slice.reduce((s, v) => s + v, 0) / w);
  return Array(horizon).fill(avg);
}

function computeLinearForecast(values, horizon = 3) {
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

/**
 * Builds combined chart data: historical months (actual) + forecast months (ma + linear).
 * Connects the lines at the last historical point as a bridge.
 */
function buildForecastChartData(monthlyConsumption, horizon = 3) {
  const activeMonths = monthlyConsumption.filter((d) => d.value > 0);
  if (activeMonths.length === 0) return [];
  const values = activeMonths.map((d) => d.value);
  const maForecast = computeMovingAvgForecast(values, 3, horizon);
  const linearForecast = computeLinearForecast(values, horizon);
  const lastMonth = activeMonths[activeMonths.length - 1];
  const futureLabels = getNextMonthLabels(lastMonth.month, horizon);
  const historical = activeMonths.map((d, idx) => ({
    month: d.month,
    actual: d.value,
    ma: idx === activeMonths.length - 1 ? maForecast[0] : null,
    linear: idx === activeMonths.length - 1 ? linearForecast[0] : null,
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

// ─── EnergyForecastCard ───────────────────────────────────────────────────────

function EnergyForecastCard({ monthlyConsumption }) {
  const HORIZON = 3;
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const data = useMemo(
    () => buildForecastChartData(monthlyConsumption, HORIZON),
    [monthlyConsumption]
  );

  const forecastMonths = data.filter((d) => d.isForecast);
  const historicalData = data.filter((d) => !d.isForecast && d.actual !== null);
  const lastActual     = historicalData.slice(-1)[0]?.actual ?? 0;
  const nextMa         = forecastMonths[0]?.ma ?? 0;
  const nextLinear     = forecastMonths[0]?.linear ?? 0;
  const hasForecast    = data.length > 0 && forecastMonths.length > 0;
  const firstForecast  = forecastMonths[0]?.month ?? "";
  const bridgeMonth    = data.find((d) => !d.isForecast && d.ma !== null)?.month;
  const maDiff         = lastActual > 0 ? ((nextMa - lastActual) / lastActual) * 100 : 0;
  const linearDiff     = lastActual > 0 ? ((nextLinear - lastActual) / lastActual) * 100 : 0;

  const ForecastTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const isForecast = data.find((d) => d.month === label)?.isForecast;
    const filtered   = payload.filter((e) => e.value !== null && e.value !== undefined);
    return (
      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-xl shadow-slate-900/10 min-w-[150px]">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[11px] font-black text-slate-700">{label}</span>
          {isForecast && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
              Predicted
            </span>
          )}
        </div>
        {filtered.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3 mt-1">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-[10px] font-bold text-slate-400">
                {entry.dataKey === "actual" ? "Actual" : entry.dataKey === "ma" ? "Avg." : "Trend"}
              </span>
            </div>
            <span className="text-[11px] font-black text-slate-700">{formatNumber(entry.value)} kWh</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 440ms ease, transform 440ms ease",
      }}
    >
      {/* ── Header row ── */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <TrendingUp size={11} />
            Forecast
          </div>
          <h2 className="text-base font-black text-slate-950">Energy Forecast</h2>
          <p className="text-xs font-bold text-slate-400">Predicted usage for the next {HORIZON} months.</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <TrendingUp size={19} />
        </div>
      </div>

      {!hasForecast ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 py-5 text-center text-sm font-black text-slate-400">
          Add more meter readings to see predictions.
        </div>
      ) : (
        <>
          {/* ── Stat row ── */}
          <div
            className="mb-4 grid grid-cols-2 gap-2"
            style={{
              opacity: visible ? 1 : 0,
              transition: "opacity 400ms ease 150ms",
            }}
          >
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5">
              <p className="text-[10px] font-black text-emerald-600">Avg. Estimate · {firstForecast}</p>
              <p className="mt-1 text-xl font-black text-emerald-800">
                {formatNumber(nextMa)}
                <span className="ml-1 text-xs font-black text-emerald-500">kWh</span>
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black ${maDiff >= 0 ? "border-red-100 bg-red-50 text-red-500" : "border-emerald-100 bg-white text-emerald-600"}`}>
                  {maDiff >= 0 ? "↑" : "↓"} {Math.abs(maDiff).toFixed(1)}%
                </span>
                <span className="text-[9px] font-bold text-slate-400">vs last month</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5">
              <p className="text-[10px] font-black text-slate-500">Trend Estimate · {firstForecast}</p>
              <p className="mt-1 text-xl font-black text-slate-950">
                {formatNumber(nextLinear)}
                <span className="ml-1 text-xs font-black text-slate-400">kWh</span>
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black ${linearDiff >= 0 ? "border-red-100 bg-red-50 text-red-500" : "border-emerald-100 bg-emerald-50 text-emerald-600"}`}>
                  {linearDiff >= 0 ? "↑" : "↓"} {Math.abs(linearDiff).toFixed(1)}%
                </span>
                <span className="text-[9px] font-bold text-slate-400">vs last month</span>
              </div>
            </div>
          </div>

          {/* ── Legend ── */}
          <div
            className="mb-2 flex flex-wrap items-center gap-3"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 400ms ease 250ms" }}
          >
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <span className="text-[10px] font-black text-slate-400">Actual</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="block h-0 w-4" style={{ borderTop: "2px dashed #059669" }} />
              <span className="text-[10px] font-black text-slate-400">Avg. Est.</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="block h-0 w-4" style={{ borderTop: "2px dashed #94a3b8" }} />
              <span className="text-[10px] font-black text-slate-400">Trend Est.</span>
            </div>
            {bridgeMonth && (
              <span className="ml-auto rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-600">
                Predicted from {bridgeMonth}
              </span>
            )}
          </div>

          {/* ── Chart ── */}
          <div
            className="h-44"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 450ms ease 300ms" }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ForecastTooltip />} cursor={{ fill: "rgba(16,185,129,0.04)" }} />
                {bridgeMonth && (
                  <ReferenceLine x={bridgeMonth} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 3" />
                )}
                <Bar dataKey="actual" fill="url(#fBarGrad)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive animationDuration={700} animationEasing="ease-out" />
                <Line type="monotone" dataKey="ma" stroke="#059669" strokeWidth={2} strokeDasharray="7 4" dot={{ r: 3.5, fill: "#059669", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive animationDuration={850} animationEasing="ease-out" />
                <Line type="monotone" dataKey="linear" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3.5, fill: "#94a3b8", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive animationDuration={1050} animationEasing="ease-out" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ── Note ── */}
          <p
            className="mt-3 text-[10px] font-bold leading-4 text-slate-400"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 400ms ease 450ms" }}
          >
            Based on saved meter readings. Avg. uses last 3 months · Trend follows usage direction.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, unit, subtitle, icon: Icon, color = "emerald" }) {
  const palette = {
    emerald: { bg: "border-emerald-100 bg-emerald-50", title: "text-emerald-700", value: "text-emerald-800", icon: "bg-emerald-700 text-white" },
    amber:   { bg: "border-amber-100 bg-amber-50",    title: "text-amber-700",   value: "text-amber-800",   icon: "bg-amber-500 text-white" },
    red:     { bg: "border-red-100 bg-red-50",        title: "text-red-700",     value: "text-red-800",     icon: "bg-red-500 text-white" },
    blue:    { bg: "border-blue-100 bg-blue-50",      title: "text-blue-700",    value: "text-blue-800",    icon: "bg-blue-600 text-white" },
  };
  const c = palette[color] ?? { bg: "border-slate-200 bg-white", title: "text-slate-500", value: "text-slate-950", icon: "bg-slate-950 text-lime-300" };

  return (
    <div className={`rounded-[1.7rem] border p-5 shadow-sm ${c.bg}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className={`text-sm font-black ${c.title}`}>{title}</p>
          <p className={`mt-2 text-3xl font-black ${c.value}`}>{value}</p>
        </div>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${c.icon}`}>
          <Icon size={23} />
        </div>
      </div>
      <p className={`text-xs font-bold ${c.title}`}>{subtitle}</p>
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
        className={`flex items-start gap-3 rounded-3xl border p-4 shadow-2xl shadow-slate-950/10 ${
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
          <p className="text-sm font-black">
            {isError ? "Something went wrong" : "Success"}
          </p>

          <p className="mt-1 text-sm font-bold leading-5 opacity-80">
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

function EnergyTrendChart({ monthlyConsumption, totalConsumption }) {
  const chartData = monthlyConsumption.map((item) => ({
    month: item.month,
    value: Number(item.value || 0),
  }));

  const maxValue = Math.max(...chartData.map((item) => item.value), 1);
  const width = 1000;
  const height = 280;
  const paddingX = 92;
  const paddingTop = 32;
  const paddingBottom = 50;
  const chartHeight = height - paddingTop - paddingBottom;
  const step =
    chartData.length > 1
      ? (width - paddingX * 2) / (chartData.length - 1)
      : 0;

  const points = chartData.map((item, index) => {
    const x = paddingX + index * step;
    const y = paddingTop + chartHeight - (item.value / maxValue) * chartHeight;

    return {
      ...item,
      x,
      y,
    };
  });

  const linePath = points
    .map((point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }

      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;

      return `C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${
          height - paddingBottom
        } L ${points[0].x} ${height - paddingBottom} Z`
      : "";

  const yTicks = [
    maxValue,
    maxValue * 0.75,
    maxValue * 0.5,
    maxValue * 0.25,
    0,
  ];

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-slate-100 bg-gradient-to-b from-white to-emerald-50/40 px-5 pb-5 pt-5">
      <div className="absolute right-6 top-6 z-10 hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/10 md:block">
        <p className="text-xs font-black text-slate-900">Current Summary</p>
        <p className="mt-1 text-[11px] font-bold text-emerald-700">
          Total: {formatNumber(totalConsumption)} kWh
        </p>
        <p className="text-[11px] font-bold text-slate-400">
          Based on saved meter readings
        </p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[285px] w-full"
        role="img"
        aria-label="Monthly energy consumption trend chart"
      >
        <defs>
          <linearGradient id="dashboardEnergyArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#84cc16" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <filter id="dashboardEnergyGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {yTicks.map((tick, index) => {
          const y = paddingTop + (chartHeight / 4) * index;

          return (
            <g key={`${tick}-${index}`}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={index === yTicks.length - 1 ? "0" : "8 8"}
              />

              <text
                x={paddingX - 14}
                y={y + 5}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-black"
              >
                {`${formatCompact(tick)} kWh`}
              </text>
            </g>
          );
        })}

        {areaPath && (
          <path
            d={areaPath}
            fill="url(#dashboardEnergyArea)"
            className="origin-bottom animate-[dashboardEnergyFadeIn_900ms_ease-out_both]"
          />
        )}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#059669"
            strokeWidth="5"
            strokeLinecap="round"
            filter="url(#dashboardEnergyGlow)"
            className="animate-[dashboardEnergyDraw_1300ms_ease-out_both]"
          />
        )}

        {points.map((point, index) => (
          <g
            key={point.month}
            className="animate-[dashboardEnergyPop_700ms_ease-out_both]"
            style={{ animationDelay: `${index * 70 + 300}ms` }}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r="7"
              fill="white"
              stroke="#059669"
              strokeWidth="4"
            />

            {point.value > 0 && (
              <text
                x={point.x}
                y={point.y - 17}
                textAnchor="middle"
                className="fill-emerald-700 text-[12px] font-black"
              >
                {formatCompact(point.value)}
              </text>
            )}

            <text
              x={point.x}
              y={height - 18}
              textAnchor="middle"
              className="fill-slate-500 text-[13px] font-black"
            >
              {point.month}
            </text>
          </g>
        ))}
      </svg>

      <style>
        {`
          @keyframes dashboardEnergyDraw {
            from {
              stroke-dasharray: 1600;
              stroke-dashoffset: 1600;
            }
            to {
              stroke-dasharray: 1600;
              stroke-dashoffset: 0;
            }
          }

          @keyframes dashboardEnergyFadeIn {
            from {
              opacity: 0;
              transform: scaleY(0.92);
            }
            to {
              opacity: 1;
              transform: scaleY(1);
            }
          }

          @keyframes dashboardEnergyPop {
            from {
              opacity: 0;
              transform: translateY(10px) scale(0.88);
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

function SectionCard({ children, className = "" }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function EuiComparisonCard({ buildingComparison, setCurrentPage }) {
  const topBuildings = buildingComparison.slice(0, 4);
  const maxEui = Math.max(...topBuildings.map((item) => item.eui), 1);

  return (
    <SectionCard>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <BarChart3 size={13} />
            EUI Ranking
          </div>

          <h2 className="text-lg font-black text-slate-950">
            Building EUI Comparison
          </h2>

          <p className="mt-1 text-sm font-bold text-slate-400">
            Highest energy use per square meter.
          </p>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <BarChart3 size={23} />
        </div>
      </div>

      {topBuildings.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
          No building EUI data yet.
        </div>
      ) : (
        <div className="space-y-3">
          {topBuildings.map((item, index) => {
            const width = Math.max(8, Math.round((item.eui / maxEui) * 100));

            return (
              <div
                key={item.building_id}
                className="animate-[sectionRise_450ms_ease-out_both] rounded-[1.25rem] border border-slate-100 bg-slate-50 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-emerald-100 hover:bg-white hover:shadow-lg hover:shadow-slate-900/5"
                style={{ animationDelay: `${index * 75}ms` }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-xs font-black ${
                        index === 0
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-slate-500"
                      }`}
                    >
                      #{index + 1}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">
                        {item.building}
                      </p>

                      <p className="mt-1 text-xs font-black text-slate-500">
                        {formatDecimal(item.eui)} kWh/m² · {formatNumber(item.totalConsumption)} kWh
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${getStatusClass(
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
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCurrentPage && setCurrentPage("analytics")}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
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
  const accuracy = Math.max(0, Math.min(100, Number(averageOcrAccuracy || 0)));
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (accuracy / 100) * circumference;
  const needsReview = pendingReadings.length + lowAccuracyReadings.length;

  return (
    <SectionCard>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <ScanLine size={13} />
            OCR Monitor
          </div>

          <h2 className="text-lg font-black text-slate-950">
            OCR Reading Status
          </h2>

          <p className="mt-1 text-sm font-bold text-slate-400">
            Accuracy and verification state.
          </p>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <ScanLine size={23} />
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/60 p-4">
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
                <p className="text-2xl font-black text-slate-950">{accuracy}%</p>
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Accuracy
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">
              {needsReview > 0 ? "Needs Review" : "All Clear"}
            </p>

            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              {needsReview > 0
                ? `${needsReview} reading${needsReview > 1 ? "s" : ""} require attention.`
                : "All OCR readings are currently verified."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-[11px] font-black text-emerald-700">Verified</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">
            {verifiedReadings.length}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[11px] font-black text-amber-700">Pending</p>
          <p className="mt-1 text-2xl font-black text-amber-600">
            {pendingReadings.length}
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <p className="text-[11px] font-black text-red-700">Low Acc.</p>
          <p className="mt-1 text-2xl font-black text-red-700">
            {lowAccuracyReadings.length}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCurrentPage && setCurrentPage("ocr")}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-lg hover:shadow-emerald-900/15"
      >
        Open OCR Upload
        <ChevronRight size={17} />
      </button>
    </SectionCard>
  );
}

function ReportsAuditCard({ setCurrentPage, readings, buildings, meters }) {
  const actions = [
    {
      title: "Generate Report",
      subtitle: `${readings.length} saved readings ready`,
      icon: FileDown,
      page: "reports",
      className: "bg-emerald-700 text-white",
    },
    {
      title: "Manage Buildings",
      subtitle: `${buildings.length} buildings registered`,
      icon: Building2,
      page: "buildings",
      className: "bg-emerald-50 text-emerald-700",
    },
    {
      title: "Manage Meters",
      subtitle: `${meters.length} meters assigned`,
      icon: Gauge,
      page: "meters",
      className: "bg-lime-100 text-emerald-800",
    },
  ];

  return (
    <SectionCard>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <ClipboardCheck size={13} />
            Audit Center
          </div>

          <h2 className="text-lg font-black text-slate-950">Reports & Audit</h2>

          <p className="mt-1 text-sm font-bold text-slate-400">
            Export, review, and manage records.
          </p>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm">
          <FileText size={23} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-[1.25rem] border border-slate-100 bg-slate-50 p-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Readings
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">{readings.length}</p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Buildings
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">{buildings.length}</p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Meters
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">{meters.length}</p>
        </div>
      </div>

      <div className="space-y-3">
        {actions.map((item, index) => {
          const Icon = item.icon;

          return (
            <button
              key={item.title}
              type="button"
              onClick={() => setCurrentPage && setCurrentPage(item.page)}
              className="animate-[sectionRise_450ms_ease-out_both] group flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-slate-100 bg-slate-50 p-3 text-left transition duration-300 hover:-translate-y-0.5 hover:border-emerald-100 hover:bg-white hover:shadow-lg hover:shadow-slate-900/5"
              style={{ animationDelay: `${index * 75}ms` }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.className}`}
                >
                  <Icon size={20} />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">
                    {item.title}
                  </p>

                  <p className="mt-1 truncate text-xs font-bold text-slate-500">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-400 transition group-hover:bg-emerald-700 group-hover:text-white">
                <ChevronRight size={16} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <p className="text-xs font-black text-emerald-700">System audit ready</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          Reports use current saved readings, buildings, and meter assignments.
        </p>
      </div>
    </SectionCard>
  );
}

export default function Dashboard({ role, setCurrentPage }) {
  const [buildings, setBuildings] = useState([]);
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
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
      setReadings(readingData);
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
      enabled: true,
      runOnMount: true,
    }
  );

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

        const eui = computeEui(totalConsumption, building.floor_area);

        const averageAccuracy = buildingReadings.length
          ? Math.round(
              buildingReadings.reduce(
                (sum, reading) => sum + Number(reading.ocr_accuracy || 0),
                0
              ) / buildingReadings.length
            )
          : 0;

        const verifiedCount = buildingReadings.filter(
          (reading) => reading.is_verified
        ).length;

        const pendingCount = buildingReadings.filter(
          (reading) => !reading.is_verified
        ).length;

        const status = getEnergyStatus(totalConsumption, building.floor_area);

        return {
          building_id: building.building_id,
          building: building.name,
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

  const monthlyConsumption = useMemo(() => {
    const monthOrder = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const grouped = monthOrder.reduce((result, month) => {
      result[month] = 0;
      return result;
    }, {});

    readings.forEach((reading) => {
      const month = getMonthName(reading.reading_date);

      if (grouped[month] !== undefined) {
        grouped[month] += reading.differential;
      }
    });

    return monthOrder.map((month) => ({
      month,
      value: grouped[month],
    }));
  }, [readings]);

  const totalConsumption = readings.reduce(
    (sum, reading) => sum + reading.differential,
    0
  );

  const mappedBuildings = buildings.filter(
    (building) => building.latitude && building.longitude
  );

  const pendingReadings = readings.filter((reading) => !reading.is_verified);
  const verifiedReadings = readings.filter((reading) => reading.is_verified);
  const lowAccuracyReadings = readings.filter(
    (reading) => Number(reading.ocr_accuracy || 0) < 90
  );

  const averageOcrAccuracy = readings.length
    ? Math.round(
        readings.reduce(
          (sum, reading) => sum + Number(reading.ocr_accuracy || 0),
          0
        ) / readings.length
      )
    : 0;

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

  const mapMarkerPositions = [
    "left-[15%] top-[21%]",
    "left-[53%] top-[17%]",
    "right-[16%] top-[25%]",
    "left-[25%] bottom-[20%]",
    "right-[23%] bottom-[21%]",
    "left-[50%] bottom-[34%]",
  ];

  const mapBuildings = buildingAnalytics.slice(0, 6).map((building, index) => ({
    ...building,
    position: mapMarkerPositions[index % mapMarkerPositions.length],
  }));

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
      title: "Total Usage",
      value: formatNumber(totalConsumption),
      subtitle: "kWh · total from saved readings",
      icon: Zap,
      color: "emerald",
    },
    {
      title: "Average EUI",
      value: formatDecimal(averageEui),
      subtitle: highestBuilding
        ? `kWh/m² · Highest: ${highestBuilding.building}`
        : "kWh/m² · No EUI records yet",
      icon: TrendingUp,
      color: averageEui > 20 ? "red" : averageEui > 10 ? "amber" : "emerald",
    },
    {
      title: "Pending OCR",
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Energy Consumption Trend
              </h2>

              <p className="mt-1 text-sm font-bold text-slate-400">
                Monthly usage from saved meter readings.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage && setCurrentPage("analytics")}
              className="w-full rounded-[18px] bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 sm:w-auto"
            >
              View Analytics
            </button>
          </div>

          <EnergyTrendChart
            monthlyConsumption={monthlyConsumption}
            totalConsumption={totalConsumption}
          />
        </div>

        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                GIS Energy Map
              </h2>

              <p className="mt-1 text-sm font-bold text-slate-400">
                Building EUI status preview.
              </p>
            </div>

            <MapPinned size={22} className="text-emerald-700" />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              <Database size={14} />
              {mappedBuildings.length} Mapped
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700">
              <AlertTriangle size={14} />
              {mapStatusSummary.critical} Critical
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              <TrendingUp size={14} />
              EUI {formatDecimal(averageEui)}
            </div>
          </div>

          <div className="relative h-[315px] overflow-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-teal-50 to-lime-50">
            <div className="absolute inset-0 opacity-80 bg-[linear-gradient(90deg,rgba(4,120,87,0.11)_1px,transparent_1px),linear-gradient(rgba(4,120,87,0.11)_1px,transparent_1px)] bg-[size:38px_38px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(16,185,129,0.22),transparent_28%),radial-gradient(circle_at_70%_35%,rgba(132,204,22,0.18),transparent_30%),radial-gradient(circle_at_68%_72%,rgba(15,118,110,0.12),transparent_28%)]" />
            <div className="absolute left-[10%] top-0 h-full w-16 rotate-12 bg-white/20" />
            <div className="absolute right-[18%] top-[-10%] h-[120%] w-12 -rotate-12 bg-white/15" />
            <div className="absolute bottom-[18%] left-0 h-10 w-full -rotate-12 bg-white/15" />

            {mapBuildings.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div>
                  <Building2 className="mx-auto text-emerald-700" size={38} />

                  <p className="mt-3 text-sm font-black text-slate-700">
                    No building map data yet
                  </p>

                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Add buildings and readings to show status markers.
                  </p>
                </div>
              </div>
            ) : (
              mapBuildings.map((building, index) => {
                const markerStyle = getMapMarkerStyle(building.status);

                return (
                  <div
                    key={`${building.building_id}-${building.building}`}
                    className={`absolute ${building.position} group grid h-14 w-14 place-items-center`}
                    title={`${building.building} - ${building.status}`}
                  >
                    <span
                      className={`absolute h-20 w-20 rounded-full blur-xl ${markerStyle.glow} animate-[mapGlow_2.8s_ease-in-out_infinite]`}
                      style={{ animationDelay: `${index * 180}ms`, willChange: "transform, opacity" }}
                    />

                    <span
                      className={`absolute h-16 w-16 rounded-full border-2 ${markerStyle.pulse} animate-[mapPulse_2.6s_ease-out_infinite]`}
                      style={{ animationDelay: `${index * 220}ms`, willChange: "transform, opacity" }}
                    />

                    <div
                      className={`relative z-10 grid h-12 w-12 place-items-center rounded-[1.15rem] border-[3px] border-white shadow-xl transition duration-300 group-hover:-translate-y-1 group-hover:scale-105 ${markerStyle.shell}`}
                    >
                      {building.status === "Critical" ? (
                        <AlertTriangle size={21} />
                      ) : (
                        <Building2 size={21} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-4">
            <span className="flex items-center justify-center gap-2 text-xs font-black text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              Normal
            </span>

            <span className="flex items-center justify-center gap-2 text-xs font-black text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              High
            </span>

            <span className="flex items-center justify-center gap-2 text-xs font-black text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Critical
            </span>

            <span className="flex items-center justify-center gap-2 text-xs font-black text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              No Data
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCurrentPage && setCurrentPage("map")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Map size={17} />
            Open Building Map
          </button>
        </div>
      </section>

      <section>
        <EnergyForecastCard monthlyConsumption={monthlyConsumption} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr]">
        <EuiComparisonCard
          buildingComparison={buildingComparison}
          setCurrentPage={setCurrentPage}
        />

        <OcrStatusCard
          averageOcrAccuracy={averageOcrAccuracy}
          verifiedReadings={verifiedReadings}
          pendingReadings={pendingReadings}
          lowAccuracyReadings={lowAccuracyReadings}
          setCurrentPage={setCurrentPage}
        />

        <ReportsAuditCard
          setCurrentPage={setCurrentPage}
          readings={readings}
          buildings={buildings}
          meters={meters}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Latest Meter Readings
              </h2>

              <p className="mt-1 text-sm font-bold text-slate-400">
                Recently saved readings.
              </p>
            </div>

            <Clock3 size={22} className="text-emerald-700" />
          </div>

          {latestReadings.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
              No readings available yet.
            </div>
          ) : (
            <div className="space-y-3">
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
                      <p className="truncate text-sm font-black text-slate-950">
                        {buildingName}
                      </p>

                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Meter: {meter?.serial_no || reading.meter_id} ·{" "}
                        {getRelativeDate(reading.reading_date)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-slate-950">
                        {formatNumber(reading.reading_value)} kWh
                      </p>

                      <span
                        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${getStatusClass(
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

        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                System Health
              </h2>

              <p className="mt-1 text-sm font-bold text-slate-400">
                Current backend summary.
              </p>
            </div>

            <CheckCircle2 size={22} className="text-emerald-700" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black text-slate-400">
                Active Buildings
              </p>

              <p className="mt-2 text-2xl font-black text-slate-950">
                {
                  buildings.filter(
                    (building) =>
                      String(building.status).toLowerCase() === "active"
                  ).length
                }
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black text-slate-400">
                Active Meters
              </p>

              <p className="mt-2 text-2xl font-black text-slate-950">
                {
                  meters.filter(
                    (meter) => String(meter.status).toLowerCase() === "active"
                  ).length
                }
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black text-slate-400">
                Mapped Buildings
              </p>

              <p className="mt-2 text-2xl font-black text-emerald-700">
                {mappedBuildings.length}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black text-slate-400">
                Saved Readings
              </p>

              <p className="mt-2 text-2xl font-black text-emerald-700">
                {readings.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <style>
        {`
          @keyframes mapPulse {
            0% {
              opacity: 0.75;
              transform: scale(0.78);
            }
            70% {
              opacity: 0;
              transform: scale(1.35);
            }
            100% {
              opacity: 0;
              transform: scale(1.35);
            }
          }

          @keyframes mapGlow {
            0%, 100% {
              opacity: 0.55;
              transform: scale(0.96);
            }
            50% {
              opacity: 1;
              transform: scale(1.08);
            }
          }

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