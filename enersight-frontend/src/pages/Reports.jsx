import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Gauge,
  Printer,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import logo from "../assets/logo/EnerSight Logo.png";

import ToastMessage from "../components/ToastMessage";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
const AUTO_REFRESH_MS = 60000;

const reportTypes = [
  "Monthly Building Report",
  "High Energy Use Report",
  "Meter Photo Check Report",
  "Audit Support Report",
];

const periodOptions = ["All Time", "This Month", "Last Month", "This Year"];

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

  if (Number.isNaN(numericValue)) {
    return "0";
  }

  return numericValue.toLocaleString();
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function isReadingInPeriod(readingDate, period) {
  if (period === "All Time") {
    return true;
  }

  if (!readingDate) {
    return false;
  }

  const date = new Date(readingDate);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  const sameMonth =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth();

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const sameLastMonth =
    date.getFullYear() === lastMonthDate.getFullYear() &&
    date.getMonth() === lastMonthDate.getMonth();

  const sameYear = date.getFullYear() === now.getFullYear();

  if (period === "This Month") {
    return sameMonth;
  }

  if (period === "Last Month") {
    return sameLastMonth;
  }

  if (period === "This Year") {
    return sameYear;
  }

  return true;
}

function getStatusStyle(status) {
  if (status === "Ready" || status === "Verified") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "Needs Review" || status === "Pending" || status === "High") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status === "Critical" || status === "Low Accuracy") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
}

function getAccuracyStyle(accuracy) {
  if (Number(accuracy) >= 90) {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (Number(accuracy) >= 80) {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  return "border-red-100 bg-red-50 text-red-700";
}

function getReadingStatus(reading) {
  return reading.is_verified ? "Verified" : "Needs Review";
}

function getConsumptionStatus(total) {
  if (Number(total) >= 5000) {
    return "Critical";
  }

  if (Number(total) >= 2500) {
    return "High";
  }

  return "Ready";
}

function ReportDetailsModal({ report, onClose }) {
  if (!report) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
              Report Details
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {report.type}
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Generated report preview based on stored readings.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 transition hover:bg-slate-50 hover:text-red-600"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Building
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {report.building}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Period
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {report.period}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Total Consumption
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {formatNumber(report.totalConsumption)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Average Reading
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {formatNumber(report.averageReading)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Highest Reading
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {formatNumber(report.highestReading)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Verification
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {report.verifiedCount} verified / {report.pendingCount} review
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Generated Date
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {report.generatedAt}
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-slate-100 bg-white p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PrintTemplate({
  reportType,
  buildingFilter,
  periodFilter,
  totalConsumption,
  averageReading,
  highestReading,
  verifiedCount,
  pendingCount,
  buildingReportRows,
}) {
  const generatedOn = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function badgeStyle(variant) {
    const variants = {
      green: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857" },
      amber: { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" },
      red: { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" },
      slate: { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569" },
    };
    return variants[variant] || variants.slate;
  }

  function accuracyBadge(accuracy) {
    if (Number(accuracy) >= 90) return badgeStyle("green");
    if (Number(accuracy) >= 80) return badgeStyle("amber");
    return badgeStyle("red");
  }

  function statusBadge(status) {
    if (status === "Ready" || status === "Verified") return badgeStyle("green");
    if (status === "High" || status === "Needs Review" || status === "Pending") return badgeStyle("amber");
    if (status === "Critical" || status === "Low Accuracy") return badgeStyle("red");
    return badgeStyle("slate");
  }

  return (
    <div
      className="hidden print:block"
      style={{ fontFamily: "'Nunito', sans-serif", background: "white", color: "#0f172a", minHeight: "100vh" }}
    >
      {/* Top accent bar */}
      <div style={{ height: "7px", background: "linear-gradient(to right, #047857, #10b981, #a3e635)" }} />

      {/* Header */}
      <div style={{ padding: "28px 40px 20px", borderBottom: "2px solid #e2e8f0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <img src={logo} alt="EnerSight" style={{ height: "52px", width: "52px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
          <div>
            <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.22em", color: "#047857", textTransform: "uppercase" }}>
              EnerSight Energy Management
            </div>
            <div style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", marginTop: "4px", lineHeight: 1.2 }}>
              Energy Consumption Report
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#94a3b8" }}>
            Date Generated
          </div>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#475569", marginTop: "4px" }}>
            {generatedOn}
          </div>
        </div>
      </div>

      {/* Report metadata row */}
      <div style={{ padding: "14px 40px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", gap: "32px", flexWrap: "wrap" }}>
        {[
          { label: "Report Type", value: reportType },
          { label: "Building", value: buildingFilter },
          { label: "Period", value: periodFilter },
          { label: "Total Records", value: (buildingReportRows.reduce((s, r) => s + r.readingCount, 0)).toString() },
        ].map((item) => (
          <div key={item.label}>
            <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#94a3b8" }}>
              {item.label}
            </div>
            <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "3px" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* KPI Summary */}
      <div style={{ padding: "24px 40px", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "14px" }}>
          Executive Summary
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
          {/* Total */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px", background: "white" }}>
            <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8" }}>Total Energy</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a", margin: "6px 0 2px" }}>{formatNumber(totalConsumption)}</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>kWh consumed</div>
          </div>
          {/* Average */}
          <div style={{ border: "1px solid #bfdbfe", borderRadius: "10px", padding: "14px 18px", background: "#eff6ff" }}>
            <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#3b82f6" }}>Average Reading</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#1e40af", margin: "6px 0 2px" }}>{formatNumber(averageReading)}</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb" }}>kWh per record</div>
          </div>
          {/* Peak */}
          <div style={{ border: "1px solid #fecaca", borderRadius: "10px", padding: "14px 18px", background: "#fef2f2" }}>
            <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#ef4444" }}>Peak Reading</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#b91c1c", margin: "6px 0 2px" }}>{formatNumber(highestReading)}</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#ef4444" }}>kWh peak value</div>
          </div>
          {/* Verification */}
          <div style={{ border: "1px solid #a7f3d0", borderRadius: "10px", padding: "14px 18px", background: "#ecfdf5" }}>
            <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#059669" }}>Verified Records</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#047857", margin: "6px 0 2px" }}>{verifiedCount}</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#059669" }}>{pendingCount} pending review</div>
          </div>
        </div>
      </div>

      {/* Building Report Table */}
      <div style={{ padding: "24px 40px 80px" }}>
        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "14px" }}>
          Building Energy Summary
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {["Building", "Meters", "Readings", "Total (kWh)", "Average", "Peak", "OCR Avg", "Status"].map((col, i) => (
                <th
                  key={col}
                  style={{
                    padding: "10px 12px",
                    textAlign: i === 0 ? "left" : i >= 6 ? "center" : "right",
                    fontWeight: 900,
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "#94a3b8",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buildingReportRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>
                  No data available for the selected filters.
                </td>
              </tr>
            ) : (
              buildingReportRows.map((row, index) => (
                <tr key={row.building_id} style={{ borderBottom: "1px solid #f1f5f9", background: index % 2 === 0 ? "white" : "#fafafa" }}>
                  <td style={{ padding: "11px 12px" }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{row.building}</div>
                    <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700, marginTop: "2px" }}>
                      {row.verifiedCount} verified · {row.pendingCount} pending
                    </div>
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: "#475569" }}>{row.meterCount}</td>
                  <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: "#475569" }}>{row.readingCount}</td>
                  <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 900, color: "#0f172a" }}>{formatNumber(row.totalConsumption)}</td>
                  <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: "#475569" }}>{formatNumber(row.averageReading)}</td>
                  <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: "#475569" }}>{formatNumber(row.highestReading)}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center" }}>
                    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: "999px", fontSize: "11px", fontWeight: 900, ...accuracyBadge(row.averageAccuracy) }}>
                      {row.averageAccuracy}%
                    </span>
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center" }}>
                    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: "999px", fontSize: "11px", fontWeight: 900, ...statusBadge(row.status) }}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {buildingReportRows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                <td style={{ padding: "10px 12px", fontWeight: 900, color: "#0f172a", fontSize: "12px" }}>
                  Totals ({buildingReportRows.length} buildings)
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#0f172a" }}>
                  {buildingReportRows.reduce((s, r) => s + r.meterCount, 0)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#0f172a" }}>
                  {buildingReportRows.reduce((s, r) => s + r.readingCount, 0)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#047857" }}>
                  {formatNumber(totalConsumption)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Footer */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 40px",
          borderTop: "1px solid #e2e8f0",
          background: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "10px",
          fontWeight: 700,
          color: "#94a3b8",
        }}
      >
        <span>EnerSight Energy Management System — This document is confidential and for internal use only.</span>
        <span>{generatedDate}</span>
      </div>
    </div>
  );
}

const Reports = () => {
  const [buildings, setBuildings] = useState([]);
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [reportType, setReportType] = useState("Monthly Building Report");
  const [buildingFilter, setBuildingFilter] = useState("All Buildings");
  const [periodFilter, setPeriodFilter] = useState("All Time");
  const [query, setQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isLoading, setIsLoading] = useState(false);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  function hideToast() {
    setToast({ message: "", type: "success" });
  }

  useEffect(() => {
    if (!toast.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      hideToast();
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toast.message]);

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

  function getMeterBuildingName(meterId) {
    const meter = getMeter(meterId);

    if (!meter) {
      return "Unknown building";
    }

    return getBuildingName(meter.building_id);
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

  async function refreshData(showSuccessToast = false) {
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

      if (showSuccessToast) {
        showToast("Reports data refreshed successfully.", "success");
      }
    } catch (error) {
      console.error("Reports refresh error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(() => refreshData(false), {
    intervalMs: AUTO_REFRESH_MS,
  });

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

  const totalConsumption = filteredReadings.reduce(
    (sum, reading) => sum + reading.differential,
    0
  );

  const averageReading = filteredReadings.length
    ? Math.round(totalConsumption / filteredReadings.length)
    : 0;

  const highestReading = filteredReadings.length
    ? Math.max(...filteredReadings.map((reading) => reading.differential))
    : 0;

  const verifiedCount = filteredReadings.filter(
    (reading) => reading.is_verified
  ).length;

  const pendingCount = filteredReadings.filter(
    (reading) => !reading.is_verified
  ).length;

  const lowAccuracyCount = filteredReadings.filter(
    (reading) => Number(reading.ocr_accuracy) < 90
  ).length;

  const buildingReportRows = useMemo(() => {
    return buildings
      .map((building) => {
        const buildingMeters = meters.filter(
          (meter) => Number(meter.building_id) === Number(building.building_id)
        );

        const meterIds = buildingMeters.map((meter) => Number(meter.meter_id));

        const buildingReadings = filteredReadings.filter((reading) =>
          meterIds.includes(Number(reading.meter_id))
        );

        const buildingTotal = buildingReadings.reduce(
          (sum, reading) => sum + reading.differential,
          0
        );

        const buildingAverage = buildingReadings.length
          ? Math.round(buildingTotal / buildingReadings.length)
          : 0;

        const buildingHighest = buildingReadings.length
          ? Math.max(...buildingReadings.map((reading) => reading.differential))
          : 0;

        const buildingVerified = buildingReadings.filter(
          (reading) => reading.is_verified
        ).length;

        const buildingPending = buildingReadings.filter(
          (reading) => !reading.is_verified
        ).length;

        const averageAccuracy = buildingReadings.length
          ? Math.round(
              buildingReadings.reduce(
                (sum, reading) => sum + Number(reading.ocr_accuracy || 0),
                0
              ) / buildingReadings.length
            )
          : 0;

        return {
          building_id: building.building_id,
          building: building.name,
          meterCount: buildingMeters.length,
          readingCount: buildingReadings.length,
          totalConsumption: buildingTotal,
          averageReading: buildingAverage,
          highestReading: buildingHighest,
          verifiedCount: buildingVerified,
          pendingCount: buildingPending,
          averageAccuracy,
          status: getConsumptionStatus(buildingTotal),
        };
      })
      .filter((row) => {
        if (buildingFilter === "All Buildings") {
          return true;
        }

        return row.building === buildingFilter;
      });
  }, [buildings, meters, filteredReadings, buildingFilter]);

  const reportFilteredRows = useMemo(() => {
    if (reportType === "High Energy Use Report") {
      return buildingReportRows
        .filter((row) => row.status === "High" || row.status === "Critical")
        .sort((a, b) => b.totalConsumption - a.totalConsumption);
    }
    if (reportType === "Meter Photo Check Report") {
      return [...buildingReportRows].sort((a, b) => a.averageAccuracy - b.averageAccuracy);
    }
    if (reportType === "Audit Support Report") {
      return [...buildingReportRows].sort((a, b) => b.pendingCount - a.pendingCount);
    }
    return [...buildingReportRows].sort((a, b) => b.totalConsumption - a.totalConsumption);
  }, [buildingReportRows, reportType]);

  const reportFilteredReadings = useMemo(() => {
    if (reportType === "High Energy Use Report") {
      const highBuildingIds = new Set(
        buildingReportRows
          .filter((row) => row.status === "High" || row.status === "Critical")
          .map((row) => Number(row.building_id))
      );
      return filteredReadings.filter((reading) => {
        const meter = metersById.get(Number(reading.meter_id));
        return meter && highBuildingIds.has(Number(meter.building_id));
      });
    }
    if (reportType === "Meter Photo Check Report") {
      return filteredReadings
        .filter((reading) => Number(reading.ocr_accuracy) < 90 || !reading.is_verified)
        .sort((a, b) => Number(a.ocr_accuracy) - Number(b.ocr_accuracy));
    }
    if (reportType === "Audit Support Report") {
      return [...filteredReadings].sort(
        (a, b) => new Date(b.reading_date) - new Date(a.reading_date)
      );
    }
    return [...filteredReadings].sort(
      (a, b) => new Date(b.reading_date) - new Date(a.reading_date)
    );
  }, [filteredReadings, buildingReportRows, reportType, meters]);

  const REPORT_CONTEXT = {
    "Monthly Building Report": {
      text: "All buildings sorted by total consumption",
      color: "slate",
    },
    "High Energy Use Report": {
      text: "Showing only High & Critical consumption buildings",
      color: "red",
    },
    "Meter Photo Check Report": {
      text: "Sorted by lowest OCR accuracy · flagged unverified & low-accuracy readings only",
      color: "amber",
    },
    "Audit Support Report": {
      text: "Sorted by most pending reviews · readings ordered newest first",
      color: "emerald",
    },
  };

  const generatedReport = {
    type: reportType,
    building: buildingFilter,
    period: periodFilter,
    totalConsumption,
    averageReading,
    highestReading,
    verifiedCount,
    pendingCount,
    generatedAt: new Date().toLocaleString(),
  };

  const reportCards = [
    {
      title: "Monthly Building Report",
      description: "Summarizes total, average, and highest building energy use.",
      icon: FileText,
      action: () => setReportType("Monthly Building Report"),
    },
    {
      title: "High Energy Use Report",
      description: "Highlights buildings with high or critical consumption.",
      icon: TrendingUp,
      action: () => setReportType("High Energy Use Report"),
    },
    {
      title: "Meter Photo Check Report",
      description: "Reviews OCR accuracy, verified readings, and pending checks.",
      icon: Gauge,
      action: () => setReportType("Meter Photo Check Report"),
    },
    {
      title: "Audit Support Report",
      description: "Provides records that support energy monitoring documentation.",
      icon: ShieldCheck,
      action: () => setReportType("Audit Support Report"),
    },
  ];

  function exportCsv() {
    const headers = [
      "Building",
      "Meters",
      "Readings",
      "Total Consumption",
      "Average Reading",
      "Highest Reading",
      "Verified",
      "Needs Review",
      "Average OCR Accuracy",
      "Status",
    ];

    const rows = buildingReportRows.map((row) => [
      row.building,
      row.meterCount,
      row.readingCount,
      row.totalConsumption,
      row.averageReading,
      row.highestReading,
      row.verifiedCount,
      row.pendingCount,
      `${row.averageAccuracy}%`,
      row.status,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", "enersight-report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    showToast("CSV report exported successfully.", "success");
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="space-y-6 font-[Nunito]">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <div className="print:hidden">
        <PageHeader
          eyebrow="Energy Reports"
          title="Reports & Audit Support"
          subtitle="Generate and review energy consumption reports."
          icon={FileText}
          status={isLoading ? "Syncing data" : `${filteredReadings.length} Records`}
          lastUpdated={lastUpdated}
          isRefreshing={isAutoRefreshing || isLoading}
          intervalMs={AUTO_REFRESH_MS}
          actions={
            <>
              <button
                type="button"
                onClick={exportCsv}
                disabled={buildingReportRows.length === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={15} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={printReport}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white/25"
              >
                <Printer size={15} />
                Print
              </button>

              <button
                type="button"
                onClick={() => setSelectedReport(generatedReport)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Eye size={15} />
                Preview
              </button>
            </>
          }
        />
      </div>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1.4fr]">
          <select
            value={reportType}
            onChange={(event) => setReportType(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            {reportTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={buildingFilter}
            onChange={(event) => setBuildingFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            <option value="All Buildings">All Buildings</option>
            {buildings.map((building) => (
              <option key={building.building_id} value={building.name}>
                {building.name}
              </option>
            ))}
          </select>

          <select
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            {periodOptions.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search size={18} className="text-slate-400" />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search report data..."
              className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 print:hidden">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-500">
                Total Energy Used
              </p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {formatNumber(totalConsumption)}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <FileText size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-400">
            kWh from selected report data
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-blue-700">
                Average Reading
              </p>
              <p className="mt-2 text-3xl font-black text-blue-800">
                {formatNumber(averageReading)}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
              <FileSpreadsheet size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-blue-700">
            Average kWh per record
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-red-700">
                Highest Reading
              </p>
              <p className="mt-2 text-3xl font-black text-red-800">
                {formatNumber(highestReading)}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500 text-white">
              <TrendingUp size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-red-700">
            Peak reading in selected data
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-amber-700">Needs Review</p>
              <p className="mt-2 text-3xl font-black text-amber-800">
                {pendingCount}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-white">
              <AlertTriangle size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-amber-700">
            {verifiedCount} verified, {lowAccuracyCount} low accuracy
          </p>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 print:hidden">
        {reportCards.map((card) => {
          const Icon = card.icon;
          const isActive = reportType === card.title;

          return (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className={`rounded-[1.7rem] border p-5 text-left shadow-sm transition ${
                isActive
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
                  <Icon size={23} />
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${
                    isActive
                      ? "border-emerald-200 bg-white text-emerald-700"
                      : "border-slate-100 bg-slate-50 text-slate-500"
                  }`}
                >
                  {isActive ? "Selected" : "Ready"}
                </span>
              </div>

              <h3 className="text-base font-black text-slate-950">
                {card.title}
              </h3>

              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                {card.description}
              </p>
            </button>
          );
        })}
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              Generated Report Preview
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {reportType} • {buildingFilter} • {periodFilter}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
              Generated: {formatDateTime(new Date().toISOString())}
            </div>
            {REPORT_CONTEXT[reportType] && (
              <p className={`text-xs font-bold ${
                REPORT_CONTEXT[reportType].color === "red"
                  ? "text-red-500"
                  : REPORT_CONTEXT[reportType].color === "amber"
                  ? "text-amber-600"
                  : REPORT_CONTEXT[reportType].color === "emerald"
                  ? "text-emerald-600"
                  : "text-slate-400"
              }`}>
                {REPORT_CONTEXT[reportType].text}
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[1.3fr_0.7fr_0.8fr_1fr_1fr_1fr_0.9fr_0.9fr] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
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
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading report data...
              </div>
            ) : reportFilteredRows.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                {reportType === "High Energy Use Report"
                  ? "No high or critical consumption buildings found."
                  : "No report data found."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reportFilteredRows.map((row) => (
                  <div
                    key={row.building_id}
                    className="grid grid-cols-[1.3fr_0.7fr_0.8fr_1fr_1fr_1fr_0.9fr_0.9fr] items-center px-4 py-4 text-sm"
                  >
                    <div>
                      <p className="font-black text-slate-950">
                        {row.building}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {row.verifiedCount} verified / {row.pendingCount} review
                      </p>
                    </div>

                    <div className="font-black text-slate-700">
                      {row.meterCount}
                    </div>

                    <div className="font-black text-slate-700">
                      {row.readingCount}
                    </div>

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
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getAccuracyStyle(
                          row.averageAccuracy
                        )}`}
                      >
                        {row.averageAccuracy}%
                      </span>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                          row.status
                        )}`}
                      >
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

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
            <ClipboardList size={23} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Reading Audit Trail
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Source records included in the selected report period.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[90px_1.1fr_1.1fr_1fr_1fr_1fr_0.9fr] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Building</div>
              <div>Meter</div>
              <div>Reading</div>
              <div>Date</div>
              <div>OCR</div>
              <div>Status</div>
            </div>

            {reportFilteredReadings.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                {reportType === "Meter Photo Check Report"
                  ? "No low-accuracy or unverified readings found."
                  : reportType === "High Energy Use Report"
                  ? "No readings from high-consumption buildings."
                  : "No audit records found."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reportFilteredReadings.map((reading) => {
                  const meter = getMeter(reading.meter_id);
                  const buildingName = getMeterBuildingName(reading.meter_id);

                  return (
                    <div
                      key={reading.record_id}
                      className="grid grid-cols-[90px_1.1fr_1.1fr_1fr_1fr_1fr_0.9fr] items-center px-4 py-4 text-sm"
                    >
                      <div className="font-black text-slate-700">
                        #{reading.record_id}
                      </div>

                      <div className="font-black text-slate-950">
                        {buildingName}
                      </div>

                      <div className="font-bold text-slate-600">
                        {meter?.serial_no || `Meter #${reading.meter_id}`}
                      </div>

                      <div className="font-black text-slate-950">
                        {formatNumber(reading.reading_value)} kWh
                      </div>

                      <div className="font-bold text-slate-600">
                        {formatDate(reading.reading_date)}
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getAccuracyStyle(
                            reading.ocr_accuracy
                          )}`}
                        >
                          {Math.round(reading.ocr_accuracy)}%
                        </span>
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                            getReadingStatus(reading)
                          )}`}
                        >
                          {getReadingStatus(reading)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <PrintTemplate
        reportType={reportType}
        buildingFilter={buildingFilter}
        periodFilter={periodFilter}
        totalConsumption={totalConsumption}
        averageReading={averageReading}
        highestReading={highestReading}
        verifiedCount={verifiedCount}
        pendingCount={pendingCount}
        buildingReportRows={reportFilteredRows}
      />

      <ReportDetailsModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
};

export default Reports;