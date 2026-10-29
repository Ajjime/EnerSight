import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  Keyboard,
  Layers,
  MapPinned,
  Plug,
  RefreshCw,
  Ruler,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import StatCard from "./StatCard";
import EmptyState from "./EmptyState";
import InfoHint from "./InfoHint";
import MiniEnergyMap from "./MiniEnergyMap";
import RateNotice from "./RateNotice";
import SkeletonRows from "./SkeletonRows";
import ForecastChart, { ForecastLegend } from "./ForecastChart";
import { useElectricityRate } from "../hooks/useElectricityRate";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { formatPeso } from "../utils/currency";
import { formatCompact, formatDecimal, formatNumber } from "../utils/format";
import { EUI_CRITICAL_THRESHOLD, EUI_HIGH_THRESHOLD } from "../utils/energyStatus";
import { buildBuildingProfile } from "../utils/buildingProfile";
import { buildForecastModel, getNextMonthLabelsFromKey } from "../utils/forecast";
import { OCR_ACCURACY_THRESHOLD, formatOcrAccuracy, isLowOcrAccuracy } from "../utils/readingQuality";

// Everything about one building in one place: the building record, its meters,
// every reading, monthly consumption and forecast, appliances and saved reports.
// Opened by clicking a building on the Buildings page, the GIS map, the Dashboard
// or Analytics. Read-only; editing stays on the Buildings and Meters pages.

const FORECAST_HORIZON = 3;
const READINGS_PAGE_SIZE = 25;

const TABS = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "consumption", label: "Consumption", icon: BarChart3 },
  { id: "meters", label: "Meters", icon: Gauge },
  { id: "readings", label: "Readings", icon: Activity },
  { id: "appliances", label: "Appliances", icon: Plug },
  { id: "reports", label: "Saved Reports", icon: FileText },
];

// Kept next to each table's grid-cols-[...] class so the two stay in step.
const MONTH_ROW_COLUMNS = "1.1fr 1fr 1fr 0.7fr 0.9fr";
const METER_ROW_COLUMNS = "1.2fr 1fr 0.8fr 0.9fr 1fr 1.2fr 0.7fr 1fr";
const READING_ROW_COLUMNS = "1.1fr 1fr 1fr 1fr 0.9fr 0.9fr 0.9fr 1fr";
const APPLIANCE_ROW_COLUMNS = "1.4fr 1fr 1fr 0.8fr 0.8fr 1fr 1fr";
const REPORT_ROW_COLUMNS = "1.6fr 1.1fr 1fr 1fr 1fr";

const TONE_STYLES = {
  green: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  red: "border-red-100 bg-red-50 text-red-700",
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  none: "border-slate-200 bg-slate-50 text-slate-600",
};

function getStatusStyle(status) {
  if (status === "Critical") return TONE_STYLES.red;
  if (status === "High") return TONE_STYLES.amber;
  if (status === "Normal") return TONE_STYLES.green;
  return TONE_STYLES.none;
}

function getStatusTile(status) {
  if (status === "Critical") return "bg-red-600 text-white";
  if (status === "High") return "bg-amber-500 text-white";
  if (status === "Normal") return "bg-emerald-700 text-white";
  return "bg-slate-200 text-slate-600";
}

function getStatusTone(status) {
  if (status === "Critical") return "red";
  if (status === "High") return "amber";
  if (status === "Normal") return "green";
  return "dark";
}

function formatDate(value, withTime = false) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function formatDays(days) {
  const rounded = Math.round(days);

  return `${rounded.toLocaleString()} day${rounded === 1 ? "" : "s"}`;
}

function formatChange(change) {
  if (change === null || change === undefined || !Number.isFinite(change)) {
    return null;
  }

  const percent = Math.round(Math.abs(change) * 100);

  if (percent === 0) {
    return "0%";
  }

  return `${change > 0 ? "+" : "−"}${percent}%`;
}

async function getJson(path, fallbackMessage) {
  const response = await apiFetch(`${API_BASE_URL}${path}`);
  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : fallbackMessage);
  }

  return data;
}

// Appliances and saved reports are extras: when either fails, its own tab says
// so instead of the whole profile refusing to open.
async function getOptionalList(path, fallbackMessage) {
  try {
    const data = await getJson(path, fallbackMessage);

    return { list: Array.isArray(data) ? data : [], error: "" };
  } catch (error) {
    return { list: [], error: error.message || fallbackMessage };
  }
}

async function loadBuildingData(buildingId) {
  const [building, meters, readings, appliances, reports] = await Promise.all([
    getJson(`/buildings/${buildingId}`, "Could not load this building."),
    getJson("/meters/", "Could not load meters."),
    getJson("/readings/", "Could not load readings."),
    getOptionalList(`/appliances/?building_id=${buildingId}`, "Could not load appliances."),
    getOptionalList(`/reports/?building_id=${buildingId}`, "Could not load saved reports."),
  ]);

  return {
    building,
    meters: Array.isArray(meters) ? meters : [],
    readings: Array.isArray(readings) ? readings : [],
    appliances: appliances.list,
    applianceError: appliances.error,
    reports: reports.list,
    reportError: reports.error,
  };
}

// ─── Small building blocks ───────────────────────────────────────────────────

function Section({ title, description, hint, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-base font-semibold text-slate-950">
            {title}
            {hint && <InfoHint term={hint} />}
          </h3>

          {description && (
            <p className="mt-1 text-sm font-normal leading-5 text-slate-500">{description}</p>
          )}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function DetailItem({ icon: Icon, label, value, wide = false }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <Icon size={16} className="mt-0.5 shrink-0 text-emerald-700" />

      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, caption, tone = "none" }) {
  const accent = {
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
    none: "text-slate-950",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      {caption && <p className="mt-0.5 text-xs font-normal text-slate-500">{caption}</p>}
    </div>
  );
}

function ChangeBadge({ change }) {
  const label = formatChange(change);

  if (!label) {
    return null;
  }

  // Using more electricity is the bad direction, so rising reads red.
  const isUp = change > 0.005;
  const isDown = change < -0.005;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        isUp ? TONE_STYLES.red : isDown ? TONE_STYLES.green : TONE_STYLES.none
      }`}
    >
      {(isUp || isDown) && <Icon size={12} />}
      {label}
    </span>
  );
}

// A table that scrolls sideways on a phone instead of squeezing its columns.
function DataTable({ columns, minWidth, headers, children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <div style={{ minWidth }}>
        <div
          className="grid items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"
          style={{ gridTemplateColumns: columns }}
        >
          {headers.map((header) => (
            <span key={header}>{header}</span>
          ))}
        </div>

        <div className="divide-y divide-slate-100">{children}</div>
      </div>
    </div>
  );
}

function SourceBadge({ reading }) {
  if (reading.ocr_accuracy === null) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_STYLES.none}`}>
        <Keyboard size={12} />
        Manual
      </span>
    );
  }

  const isLow = isLowOcrAccuracy(reading);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        isLow ? TONE_STYLES.red : TONE_STYLES.green
      }`}
      title={isLow ? `Below ${OCR_ACCURACY_THRESHOLD}%: check the photo` : undefined}
    >
      <Camera size={12} />
      OCR {formatOcrAccuracy(reading.ocr_accuracy)}
    </span>
  );
}

function VerifiedBadge({ isVerified }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        isVerified ? TONE_STYLES.green : TONE_STYLES.amber
      }`}
    >
      {isVerified ? <CheckCircle2 size={12} /> : <Clock size={12} />}
      {isVerified ? "Verified" : "Needs review"}
    </span>
  );
}

function MonthlyTooltip({ active, payload, label, rate }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-950">
        {point.isGap ? "No readings recorded" : `${formatNumber(point.value)} kWh`}
      </p>
      {!point.isGap && (
        <p className="mt-0.5 text-xs font-medium text-slate-500">{formatPeso(point.value * rate, { decimals: 0 })}</p>
      )}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function OverviewTab({ building, profile, rate, onShowTab }) {
  const { totals, quality } = profile;
  const floorArea = Number(building.floor_area || 0);
  const hasCoordinates =
    building.latitude !== null &&
    building.longitude !== null &&
    Number.isFinite(Number(building.latitude)) &&
    Number.isFinite(Number(building.longitude));
  const latest = totals.latestReading;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total consumption"
          compactValue
          value={`${formatNumber(totals.consumption)} kWh`}
          icon={Zap}
          tone="green"
          description={`Measured from ${formatNumber(totals.readingCount)} meter reading${totals.readingCount === 1 ? "" : "s"}.`}
        />

        <StatCard
          title="Electricity cost"
          compactValue
          value={formatPeso(totals.cost, { decimals: 0 })}
          icon={Wallet}
          tone="blue"
          hint="ratePerKwh"
          description={`At ${formatPeso(rate)} per kWh.`}
        />

        <StatCard
          title="Energy intensity"
          compactValue
          value={totals.status === "No Data" ? "—" : `${formatDecimal(totals.eui, 1)}`}
          icon={Gauge}
          tone={getStatusTone(totals.status)}
          hint="eui"
          description={
            totals.status === "No Data"
              ? "Needs floor area and consumption."
              : `kWh/m²/yr · ${totals.status}`
          }
        />

        <StatCard
          title="Latest reading"
          compactValue
          value={latest ? `${formatNumber(latest.reading_value)} kWh` : "—"}
          icon={Calendar}
          tone="purple"
          description={latest ? `${formatDate(latest.reading_date)} · ${latest.serial_no}` : "No readings yet."}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Section title="Building details" description="The saved building record.">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <DetailItem icon={Layers} label="Building type" value={building.building_type || "—"} />
            <DetailItem icon={Activity} label="Operational status" value={building.status || "Active"} />
            <DetailItem icon={Ruler} label="Floor area" value={floorArea > 0 ? `${formatNumber(floorArea)} m²` : "Not set"} />
            <DetailItem icon={Gauge} label="Meters" value={`${totals.meterCount} installed`} />
            <DetailItem icon={MapPinned} label="Address" value={building.address || "No address saved"} wide />
            <DetailItem
              icon={MapPinned}
              label="Coordinates"
              value={hasCoordinates ? `${building.latitude}, ${building.longitude}` : "Not mapped"}
              wide
            />
            <DetailItem icon={Calendar} label="Monitored since" value={formatDate(totals.firstReadingDate)} />
            <DetailItem
              icon={Clock}
              label="Period covered"
              value={totals.spanDays > 0 ? formatDays(totals.spanDays) : "—"}
            />
          </div>
        </Section>

        <Section title="Location" description={hasCoordinates ? "Pin colour shows the energy status." : undefined}>
          <MiniEnergyMap
            height={352}
            buildings={[
              {
                building_id: building.building_id,
                building: building.name,
                latitude: hasCoordinates ? building.latitude : null,
                longitude: hasCoordinates ? building.longitude : null,
                status: totals.status,
              },
            ]}
          />
        </Section>
      </div>

      <Section
        title="Energy status"
        hint="euiStatus"
        description={`Normal up to ${EUI_HIGH_THRESHOLD}, High above ${EUI_HIGH_THRESHOLD}, Critical above ${EUI_CRITICAL_THRESHOLD} kWh/m²/yr.`}
        action={
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusStyle(totals.status)}`}>
            {totals.status}
          </span>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">How it was worked out</p>

            {totals.status === "No Data" ? (
              <p className="mt-1">
                {floorArea > 0
                  ? "No consumption has been measured yet, so there is nothing to grade."
                  : "The building has no floor area saved, so intensity cannot be worked out."}
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {formatNumber(totals.consumption)} kWh ÷ {formatNumber(floorArea)} m² ={" "}
                  <span className="font-semibold text-slate-950">{formatDecimal(totals.rawEui)} kWh/m²</span>{" "}
                  over {formatDays(totals.spanDays)}.
                </p>

                <p className="mt-1">
                  {totals.isAnnualized ? (
                    <>
                      Scaled to a year (× 365 ÷ {formatNumber(totals.spanDays)}) ={" "}
                      <span className="font-semibold text-slate-950">{formatDecimal(totals.eui)} kWh/m²/yr</span>.
                    </>
                  ) : (
                    "Under 20 days of readings, so it is not scaled up to a year."
                  )}
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Recommendation</p>
            <p className="mt-1 text-sm font-normal leading-6 text-emerald-900">{profile.recommendation}</p>
          </div>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Monthly highlights"
          action={
            <button
              type="button"
              onClick={() => onShowTab("consumption")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              See all months
            </button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Latest month{totals.latestMonth ? ` · ${totals.latestMonth.month}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xl font-bold tabular-nums text-slate-950">
                  {totals.latestMonth ? `${formatNumber(totals.latestMonth.value)} kWh` : "—"}
                </p>
                {totals.latestMonth && <ChangeBadge change={totals.latestMonth.change} />}
              </div>
              {totals.previousMonth && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {totals.previousMonth.month}: {formatNumber(totals.previousMonth.value)} kWh
                </p>
              )}
            </div>

            <MiniStat
              label="Peak month"
              value={totals.peakMonth ? `${formatNumber(totals.peakMonth.value)} kWh` : "—"}
              caption={totals.peakMonth ? totals.peakMonth.month : "No monthly data yet."}
            />

            <MiniStat
              label="Measured per month"
              value={totals.measuredKwhMonth === null ? "—" : `${formatNumber(totals.measuredKwhMonth)} kWh`}
              caption={
                totals.measuredKwhMonth === null
                  ? "Needs at least 20 days of readings."
                  : `About ${formatPeso(totals.measuredKwhMonth * rate, { decimals: 0 })} a month.`
              }
            />

            <MiniStat
              label="Appliance estimate"
              value={profile.appliances.length ? `${formatNumber(totals.estimatedKwhMonth)} kWh` : "—"}
              caption={
                profile.appliances.length
                  ? `${profile.appliances.length} appliance${profile.appliances.length === 1 ? "" : "s"} listed, per month.`
                  : "No appliance list yet."
              }
            />
          </div>
        </Section>

        <Section
          title="Reading quality"
          hint="ocrAccuracy"
          action={
            <button
              type="button"
              onClick={() => onShowTab("readings")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              See all readings
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="Photo (OCR)" value={formatNumber(quality.ocrCount)} caption="readings" />
            <MiniStat label="Typed in" value={formatNumber(quality.manualCount)} caption="manual readings" />
            <MiniStat
              label="Avg OCR"
              value={quality.averageAccuracy === null ? "—" : `${quality.averageAccuracy}%`}
              caption="photo readings only"
              tone={quality.averageAccuracy === null ? "none" : quality.averageAccuracy >= OCR_ACCURACY_THRESHOLD ? "green" : "amber"}
            />
            <MiniStat
              label="Low accuracy"
              value={formatNumber(quality.lowAccuracyCount)}
              caption={`below ${OCR_ACCURACY_THRESHOLD}%`}
              tone={quality.lowAccuracyCount > 0 ? "red" : "none"}
            />
            <MiniStat label="Verified" value={formatNumber(quality.verifiedCount)} tone="green" />
            <MiniStat
              label="Needs review"
              value={formatNumber(quality.pendingCount)}
              tone={quality.pendingCount > 0 ? "amber" : "none"}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function ConsumptionTab({ profile, rate }) {
  const { monthly } = profile;

  const model = useMemo(
    () =>
      buildForecastModel(monthly, FORECAST_HORIZON, (lastPoint, count) =>
        getNextMonthLabelsFromKey(lastPoint.sortKey, count)
      ),
    [monthly]
  );

  const bestMethod = model?.methods.find((method) => method.key === model.bestKey);
  const nextMonth = model?.series.find((row) => row.isForecast);
  const nextValue = nextMonth && model ? nextMonth[model.bestKey] : null;
  const newestFirst = useMemo(() => [...monthly].reverse(), [monthly]);

  if (monthly.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No consumption recorded yet"
        description="Monthly consumption appears once this building's meters have readings."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Section
        title={model ? "Monthly consumption and forecast" : "Monthly consumption"}
        hint={model ? "forecastMethod" : undefined}
        description={
          model
            ? `Bars are measured kWh per month. The dashed line is the ${bestMethod.label.toLowerCase()} estimate, which tested closest on this building's past months.`
            : "Bars are measured kWh per month. A forecast needs readings from at least 3 months."
        }
      >
        {model ? (
          <>
            {nextValue !== null && (
              <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Next month · {nextMonth.month}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
                    {formatNumber(nextValue)} <span className="text-sm font-medium text-slate-400">kWh</span>
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  About <span className="font-semibold text-slate-900">{formatPeso(nextValue * rate, { decimals: 0 })}</span>
                  {bestMethod.error !== null &&
                    ` · landed within about ${Math.round(bestMethod.error * 100)}% on past months`}
                </p>
              </div>
            )}

            <ForecastLegend model={model} className="mb-2" leadingOnly />
            <ForecastChart model={model} className="h-64" gradientId="profileForecastBar" leadingOnly />
          </>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
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
                  width={48}
                />
                <Tooltip content={<MonthlyTooltip rate={rate} />} cursor={{ fill: "rgba(16,185,129,0.04)" }} />
                <Bar dataKey="value" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title="Month by month" description="Newest first. Change compares each month with the one before it.">
        <DataTable
          columns={MONTH_ROW_COLUMNS}
          minWidth={560}
          headers={["Month", "Consumption", "Cost", "Readings", "Change"]}
        >
          {newestFirst.map((point) => (
            <div
              key={point.sortKey}
              className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.9fr] items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="font-semibold text-slate-800">{point.month}</span>
              <span className="tabular-nums text-slate-700">
                {point.isGap ? <span className="text-slate-400">No readings</span> : `${formatNumber(point.value)} kWh`}
              </span>
              <span className="tabular-nums text-slate-700">{point.isGap ? "—" : formatPeso(point.cost, { decimals: 0 })}</span>
              <span className="tabular-nums text-slate-700">{point.readingCount}</span>
              <span>
                {point.isGap || formatChange(point.change) === null ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <ChangeBadge change={point.change} />
                )}
              </span>
            </div>
          ))}
        </DataTable>
      </Section>
    </div>
  );
}

function MetersTab({ profile }) {
  if (profile.meters.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        variant="blocked"
        title="No meters installed"
        description="Add a meter for this building on the Meters page before readings can be recorded."
      />
    );
  }

  return (
    <Section
      title="Meters"
      description="Each meter's latest reading and how much of the building's measured consumption it accounts for."
    >
      <DataTable
        columns={METER_ROW_COLUMNS}
        minWidth={920}
        headers={["Serial no.", "Type", "Status", "Installed", "Initial reading", "Latest reading", "Readings", "kWh used"]}
      >
        {profile.meters.map((meter) => (
          <div
            key={meter.meter_id}
            className="grid grid-cols-[1.2fr_1fr_0.8fr_0.9fr_1fr_1.2fr_0.7fr_1fr] items-center gap-3 px-4 py-3 text-sm"
          >
            <span className="truncate font-semibold text-slate-950">{meter.serial_no || `#${meter.meter_id}`}</span>
            <span className="min-w-0 text-slate-700">
              <span className="block truncate">{meter.meter_type || "—"}</span>
              {meter.meter_category && (
                <span className="block truncate text-xs text-slate-400">{meter.meter_category}</span>
              )}
            </span>
            <span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  meter.status === "Active" ? TONE_STYLES.green : TONE_STYLES.none
                }`}
              >
                {meter.status || "—"}
              </span>
            </span>
            <span className="text-slate-700">{formatDate(meter.installation_date)}</span>
            <span className="tabular-nums text-slate-700">{formatNumber(meter.initial_reading)} kWh</span>
            <span className="min-w-0 text-slate-700">
              {meter.latest ? (
                <>
                  <span className="block tabular-nums">{formatNumber(meter.latest.reading_value)} kWh</span>
                  <span className="block text-xs text-slate-400">{formatDate(meter.latest.reading_date)}</span>
                </>
              ) : (
                <span className="text-slate-400">No readings</span>
              )}
            </span>
            <span className="tabular-nums text-slate-700">{meter.readingCount}</span>
            <span className="min-w-0">
              <span className="block tabular-nums font-semibold text-slate-950">{formatNumber(meter.consumption)} kWh</span>
              <span className="block text-xs text-slate-400">{Math.round(meter.share * 100)}% of total</span>
            </span>
          </div>
        ))}
      </DataTable>
    </Section>
  );
}

function ReadingsTab({ profile }) {
  const [meterFilter, setMeterFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(READINGS_PAGE_SIZE);

  const filtered = useMemo(
    () =>
      meterFilter === "all"
        ? profile.readings
        : profile.readings.filter((reading) => String(reading.meter_id) === meterFilter),
    [profile.readings, meterFilter]
  );

  if (profile.readings.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No readings yet"
        description="Readings saved from Add Meter Reading, by photo or typed in, appear here."
      />
    );
  }

  const shown = filtered.slice(0, visibleCount);

  return (
    <Section
      title="Reading history"
      description="Every saved reading, newest first. kWh used is the present reading minus the previous one."
      action={
        profile.meters.length > 1 && (
          <select
            value={meterFilter}
            onChange={(event) => {
              setMeterFilter(event.target.value);
              setVisibleCount(READINGS_PAGE_SIZE);
            }}
            aria-label="Filter readings by meter"
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="all">All meters</option>
            {profile.meters.map((meter) => (
              <option key={meter.meter_id} value={String(meter.meter_id)}>
                {meter.serial_no || `Meter #${meter.meter_id}`}
              </option>
            ))}
          </select>
        )
      }
    >
      <DataTable
        columns={READING_ROW_COLUMNS}
        minWidth={940}
        headers={["Date", "Meter", "Previous", "Present", "kWh used", "Cost", "Source", "Status"]}
      >
        {shown.map((reading) => (
          <div
            key={reading.record_id}
            className="grid grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr_0.9fr_0.9fr_1fr] items-center gap-3 px-4 py-3 text-sm"
          >
            <span className="font-medium text-slate-800">{formatDate(reading.reading_date)}</span>
            <span className="truncate text-slate-700">{reading.serial_no}</span>
            <span className="tabular-nums text-slate-700">{formatNumber(reading.previous_reading)}</span>
            <span className="tabular-nums text-slate-700">{formatNumber(reading.reading_value)}</span>
            <span className="tabular-nums font-semibold text-slate-950">{formatNumber(reading.differential)}</span>
            <span className="tabular-nums text-slate-700">{formatPeso(reading.cost, { decimals: 0 })}</span>
            <span>
              <SourceBadge reading={reading} />
            </span>
            <span>
              <VerifiedBadge isVerified={reading.is_verified} />
            </span>
          </div>
        ))}
      </DataTable>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          Showing {shown.length} of {filtered.length} reading{filtered.length === 1 ? "" : "s"}
        </span>

        {shown.length < filtered.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + READINGS_PAGE_SIZE)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Show {Math.min(READINGS_PAGE_SIZE, filtered.length - shown.length)} more
          </button>
        )}
      </div>
    </Section>
  );
}

function AppliancesTab({ profile, rate, error }) {
  const { totals, applianceComparison: comparison } = profile;

  if (error) {
    return <EmptyState icon={AlertTriangle} variant="blocked" title="Appliances could not be loaded" description={error} />;
  }

  if (profile.appliances.length === 0) {
    return (
      <EmptyState
        icon={Plug}
        title="No appliance list yet"
        description="Add this building's appliances on the Buildings page (plug icon) to estimate what it should use."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Section
        title="Measured vs estimated"
        hint="measuredVsEstimated"
        description="Meter readings show what the building used. The appliance list estimates what it should use. They are compared, never added together."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat
            label="Measured per month"
            value={totals.measuredKwhMonth === null ? "—" : `${formatNumber(totals.measuredKwhMonth)} kWh`}
            caption="from meter readings"
            tone="green"
          />
          <MiniStat
            label="Estimated per month"
            value={`${formatNumber(totals.estimatedKwhMonth)} kWh`}
            caption={`${formatPeso(totals.estimatedCostMonth, { decimals: 0 })} a month`}
          />
          <div className={`rounded-xl border px-4 py-3 text-sm leading-5 ${TONE_STYLES[comparison.tone]}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">Verdict</p>
            <p className="mt-1 font-medium">{comparison.text}</p>
          </div>
        </div>
      </Section>

      <Section
        title="Appliance list"
        description="Estimated kWh per month = watts × quantity × hours per day × days per month ÷ 1000."
      >
        <DataTable
          columns={APPLIANCE_ROW_COLUMNS}
          minWidth={760}
          headers={["Appliance", "Category", "Watts × qty", "Hours/day", "Days/month", "kWh/month", "Cost/month"]}
        >
          {profile.appliances.map((appliance) => (
            <div
              key={appliance.appliance_id}
              className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr_1fr_1fr] items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="truncate font-semibold text-slate-950" title={appliance.name}>
                {appliance.name}
              </span>
              <span className="truncate text-slate-700">{appliance.category || "—"}</span>
              <span className="tabular-nums text-slate-700">
                {formatNumber(appliance.wattage)} W × {appliance.quantity}
              </span>
              <span className="tabular-nums text-slate-700">{formatDecimal(appliance.hours_per_day, 1)}</span>
              <span className="tabular-nums text-slate-700">{appliance.days_per_month}</span>
              <span className="tabular-nums font-semibold text-slate-950">{formatDecimal(appliance.kwhMonth, 1)}</span>
              <span className="tabular-nums text-slate-700">{formatPeso(appliance.costMonth, { decimals: 0 })}</span>
            </div>
          ))}
        </DataTable>

        <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <span className="text-slate-500">
            Total: <span className="font-semibold text-slate-950">{formatDecimal(totals.estimatedKwhMonth, 1)} kWh</span>
          </span>
          <span className="text-slate-500">
            <span className="font-semibold text-slate-950">{formatPeso(totals.estimatedKwhMonth * rate, { decimals: 0 })}</span> a month
          </span>
        </div>
      </Section>
    </div>
  );
}

function ReportsTab({ reports, error }) {
  if (error) {
    return <EmptyState icon={AlertTriangle} variant="blocked" title="Saved reports could not be loaded" description={error} />;
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No saved reports for this building"
        description="Reports generated on the Reports page with this building selected are listed here."
      />
    );
  }

  return (
    <Section title="Saved reports" description="Snapshots of reports generated for this building, newest first.">
      <DataTable
        columns={REPORT_ROW_COLUMNS}
        minWidth={680}
        headers={["Report", "Generated", "Total", "Average", "Peak"]}
      >
        {reports.map((report) => (
          <div
            key={report.report_id}
            className="grid grid-cols-[1.6fr_1.1fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3 text-sm"
          >
            <span className="truncate font-semibold text-slate-950" title={report.report_type || undefined}>
              {report.report_type || "Report"}
            </span>
            <span className="text-slate-700">{formatDate(report.generated_at, true)}</span>
            <span className="tabular-nums text-slate-700">{formatNumber(report.total_consumption)} kWh</span>
            <span className="tabular-nums text-slate-700">{formatNumber(report.average_consumption)} kWh</span>
            <span className="tabular-nums text-slate-700">{formatNumber(report.peak_consumption)} kWh</span>
          </div>
        ))}
      </DataTable>
    </Section>
  );
}

// ─── The panel ───────────────────────────────────────────────────────────────

export default function BuildingProfile({ buildingId, buildingName = "", onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const { rate, isFallback: isRateFallback, error: rateError } = useElectricityRate();

  useEffect(() => {
    let cancelled = false;

    loadBuildingData(buildingId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setErrorMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Building profile error:", error);
        setErrorMessage(error.message || "Cannot connect to server. Please make sure FastAPI is running.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId, reloadKey]);

  function showTab(tabId) {
    setActiveTab(tabId);
    bodyRef.current?.scrollTo({ top: 0 });
  }

  function reload() {
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }

  // Pages pass an inline onClose, which is a new function on every render. Reading
  // it through a ref keeps the effect below from re-running (and yanking focus back
  // to the close button) each time the page behind auto-refreshes.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes, focus moves into the panel on open and back where it came from
  // on close, and the page behind stops scrolling - the same contract as
  // ConfirmationModal.
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") onCloseRef.current?.();
    }

    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const profile = useMemo(
    () =>
      data
        ? buildBuildingProfile({
            building: data.building,
            meters: data.meters,
            readings: data.readings,
            appliances: data.appliances,
            rate,
          })
        : null,
    [data, rate]
  );

  const building = data?.building;
  const status = profile?.totals.status || "No Data";

  const tabCounts = profile
    ? {
        meters: profile.meters.length,
        readings: profile.readings.length,
        appliances: profile.appliances.length,
        reports: data.reports.length,
      }
    : {};

  const content = (
    <div className="fixed inset-0 z-[50000] flex items-stretch justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-fade-up relative flex h-full w-full max-w-6xl flex-col overflow-hidden bg-slate-50 shadow-xl sm:h-[92vh] sm:rounded-2xl"
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${getStatusTile(status)}`}>
              <Building2 size={22} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Building Profile · #{buildingId}
              </p>

              <h2 id={titleId} className="mt-1 break-words text-xl font-bold leading-tight text-slate-950 sm:text-2xl">
                {building?.name || buildingName || "Building"}
              </h2>

              {building && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full border px-2.5 py-0.5 font-semibold ${getStatusStyle(status)}`}>
                    {status}
                  </span>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 font-medium text-blue-700">
                    {building.building_type || "Building"}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-medium ${
                      building.status === "Inactive" ? TONE_STYLES.none : TONE_STYLES.green
                    }`}
                  >
                    {building.status || "Active"}
                  </span>
                  {building.address && <span className="truncate text-slate-500">{building.address}</span>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={reload}
                disabled={isLoading}
                aria-label="Refresh building data"
                title="Refresh"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-60"
              >
                <RefreshCw size={17} className={isLoading ? "animate-spin" : ""} />
              </button>

              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close building profile"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-red-600"
              >
                <X size={19} />
              </button>
            </div>
          </div>

          <nav role="tablist" aria-label="Building profile sections" className="-mx-1 mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const count = tabCounts[tab.id];
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => showTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-3 pt-1 text-sm font-semibold transition ${
                    isActive
                      ? "border-emerald-600 text-emerald-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                  {count !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {errorMessage && !profile ? (
            <EmptyState
              icon={AlertTriangle}
              variant="blocked"
              title="This building could not be loaded"
              description={errorMessage}
              action={
                <button
                  type="button"
                  onClick={reload}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <RefreshCw size={15} />
                  Try again
                </button>
              }
            />
          ) : !profile ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" role="status" aria-label="Loading building data">
              <SkeletonRows columns="1fr 1fr 1fr 1fr" rows={6} />
            </div>
          ) : (
            <div className="space-y-5">
              <RateNotice isFallback={isRateFallback} error={rateError} />

              {errorMessage && (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Refresh failed: {errorMessage} Showing the last loaded data.
                </p>
              )}

              {activeTab === "overview" && (
                <OverviewTab building={building} profile={profile} rate={rate} onShowTab={showTab} />
              )}
              {activeTab === "consumption" && <ConsumptionTab profile={profile} rate={rate} />}
              {activeTab === "meters" && <MetersTab profile={profile} />}
              {activeTab === "readings" && <ReadingsTab profile={profile} />}
              {activeTab === "appliances" && (
                <AppliancesTab profile={profile} rate={rate} error={data.applianceError} />
              )}
              {activeTab === "reports" && <ReportsTab reports={data.reports} error={data.reportError} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
