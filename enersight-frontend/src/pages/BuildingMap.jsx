import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Eye,
  Flame,
  Map as MapIcon,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  Satellite,
  Scan,
  Search,
  X,
  Zap,
} from "lucide-react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import PageHeader from "../components/PageHeader";
import HeaderActionButton from "../components/HeaderActionButton";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import SkeletonRows from "../components/SkeletonRows";
import { useAutoRefresh } from "../hooks/useAutoRefresh";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { formatDecimal, formatNumber } from "../utils/format";
import { getAverageOcrAccuracy, getOcrScore } from "../utils/readingQuality";
import {
  ENERGY_STATUS_OPTIONS,
  EUI_CRITICAL_THRESHOLD,
  EUI_HIGH_THRESHOLD,
  computeEui,
  getEnergyStatus,
} from "../utils/energyStatus";
const AUTO_REFRESH_MS = 30000;

const DEFAULT_CENTER = [7.3019, 125.6852];
const DEFAULT_ZOOM = 16;
const FOCUS_ZOOM = 18;
const MAP_MAX_ZOOM = 20;
const STATUS_FILTERS = ["All", ...ENERGY_STATUS_OPTIONS];

// Worst first, so the building that most needs attention tops the list and is the
// one selected when the page opens.
const STATUS_RANK = { Critical: 0, High: 1, Normal: 2, "No Data": 3 };

// OpenStreetMap's default style paints roads orange and yellow and scatters shop
// and church icons everywhere, which drowned out the status markers. The muted
// hosted styles (CARTO, Stadia) stamp "API KEY REQUIRED" over their tiles without
// an account, so these stay OSM tiles and `energy-street-tiles` in index.css tones
// them down. The filter sits on the tile layer only, so pin colours stay true.
// Satellite imagery is for checking that a pin actually sits on the right roof.
const BASE_LAYERS = {
  map: {
    label: "Map",
    icon: MapIcon,
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    className: "energy-street-tiles",
    maxNativeZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    label: "Satellite",
    icon: Satellite,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    // Imagery past z18 is patchy in Mindanao, so deeper zooms upscale z18 tiles
    // instead of showing "Map data not yet available" squares.
    maxNativeZoom: 18,
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },
};

// computeEui and getEnergyStatus were local copies of the same thresholds that
// Dashboard also carried. Both now come from utils/energyStatus.js so the map,
// the Dashboard, Analytics and Reports cannot drift apart again.

function normalizeBuildingMapRow(row) {
  const totalConsumption = Number(row.total_consumption || 0);
  const floorArea = Number(row.floor_area || 0);
  const eui = Number(row.eui ?? computeEui(totalConsumption, floorArea));

  return {
    building_id: row.building_id,
    name: row.name || "Unnamed Building",
    latitude: row.latitude ?? "",
    longitude: row.longitude ?? "",
    floor_area: floorArea,
    building_type: row.building_type || "Building",
    building_status: row.building_status || row.status || "Active",
    energy_status:
      row.energy_status || getEnergyStatus(totalConsumption, floorArea),
    eui,
    meter_count: Number(row.meter_count || 0),
    reading_count: Number(row.reading_count || 0),
    total_consumption: totalConsumption,
    latest_reading: Number(row.latest_reading || 0),
    latest_reading_date: row.latest_reading_date || "",
    average_accuracy: Number(row.average_accuracy || 0),
    verified_count: Number(row.verified_count || 0),
    pending_count: Number(row.pending_count || 0),
  };
}

function normalizeBuilding(building) {
  return {
    building_id: building.building_id,
    name: building.name || "Unnamed Building",
    latitude: building.latitude ?? "",
    longitude: building.longitude ?? "",
    floor_area: Number(building.floor_area || 0),
    building_type: building.building_type || "Building",
    building_status: building.status || "Active",
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
  return {
    record_id: reading.record_id,
    meter_id: reading.meter_id,
    reading_value: Number(reading.reading_value || 0),
    reading_date: reading.reading_date || "",
    ocr_accuracy: getOcrScore(reading.ocr_accuracy),
    is_verified: Boolean(reading.is_verified),
  };
}

function formatShortDate(value) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return value || "";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusColor(status) {
  if (status === "Critical") {
    return "#dc2626";
  }

  if (status === "High") {
    return "#f59e0b";
  }

  if (status === "Normal") {
    return "#059669";
  }

  return "#64748b";
}

function getStatusStyle(status) {
  if (status === "Critical") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  if (status === "High") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status === "Normal") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
}

function getStatusTint(status) {
  if (status === "Critical") {
    return "bg-red-50 text-red-600";
  }

  if (status === "High") {
    return "bg-amber-50 text-amber-600";
  }

  if (status === "Normal") {
    return "bg-emerald-50 text-emerald-700";
  }

  return "bg-slate-100 text-slate-500";
}

function getRecommendation(building) {
  if (!building) {
    return "Select a building to view GIS-based energy monitoring details.";
  }

  if (building.energy_status === "Critical") {
    return "Critical EUI detected. Review this building immediately.";
  }

  if (building.energy_status === "High") {
    return "High EUI detected. Monitor this building closely.";
  }

  if (building.pending_count > 0) {
    return "Some readings still need manual verification.";
  }

  if (building.energy_status === "No Data") {
    return "Add meter readings and floor area to compute EUI.";
  }

  return "Building EUI is within the normal monitoring range.";
}

function formatEui(building) {
  return building.energy_status === "No Data" ? "—" : formatDecimal(building.eui);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Lucide's Building2, inlined because a divIcon takes an HTML string.
const BUILDING_GLYPH =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>';

// react-leaflet calls setIcon whenever the icon prop is a new object, which rebuilds
// the marker's DOM and restarts the Critical pulse. Reusing one icon per look keeps
// the markers still across the 30-second refresh.
const markerIconCache = new Map();

function getMarkerIcon(building, isSelected) {
  const status = building.energy_status;
  const cacheKey = `${status}|${isSelected ? building.name : ""}`;

  if (markerIconCache.has(cacheKey)) {
    return markerIconCache.get(cacheKey);
  }

  const classes = [
    "energy-pin",
    isSelected ? "is-selected" : "",
    status === "Critical" ? "is-critical" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // The pin's tip sits at (18, 39) inside the 36x42 box; see .energy-pin in
  // index.css for the geometry.
  const icon = L.divIcon({
    className: "energy-marker",
    html: `
      ${isSelected ? `<span class="energy-pin__label">${escapeHtml(building.name)}</span>` : ""}
      <span class="${classes}" style="--pin-color: ${getStatusColor(status)}">
        <span class="energy-pin__pulse"></span>
        <span class="energy-pin__head"><span class="energy-pin__glyph">${BUILDING_GLYPH}</span></span>
      </span>
    `,
    iconSize: [36, 42],
    iconAnchor: [18, 39],
    tooltipAnchor: [0, -36],
  });

  markerIconCache.set(cacheKey, icon);

  return icon;
}

function toLatLng(building) {
  return [Number(building.latitude), Number(building.longitude)];
}

function fitMapToBuildings(map, buildings, animate = true) {
  const points = buildings.map(toLatLng);

  if (points.length === 0) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate });
    return;
  }

  if (points.length === 1) {
    map.setView(points[0], FOCUS_ZOOM, { animate });
    return;
  }

  map.fitBounds(L.latLngBounds(points), {
    padding: [64, 64],
    maxZoom: FOCUS_ZOOM,
    animate,
  });
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function MapControlButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
    >
      {children}
    </button>
  );
}

function CardMetric({ label, value, unit }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-slate-950">
        {value}
      </p>

      <p className="text-[10px] leading-3 text-slate-400">{unit}</p>
    </div>
  );
}

function SelectedBuildingCard({ building, onClose, onViewDetails }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${getStatusTint(
            building.energy_status
          )}`}
        >
          <Building2 size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-tight text-slate-950">
            {building.name}
          </h3>

          <p className="mt-1 truncate text-xs text-slate-500">
            {building.building_type} · {building.meter_count}{" "}
            {building.meter_count === 1 ? "meter" : "meters"} ·{" "}
            {building.reading_count} readings
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close building details"
          className="-mr-1 -mt-1 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/80">
        <CardMetric label="EUI" value={formatEui(building)} unit="kWh/m²" />
        <CardMetric
          label="Used"
          value={formatNumber(building.total_consumption)}
          unit="kWh"
        />
        <CardMetric
          label="Area"
          value={formatNumber(building.floor_area)}
          unit="m²"
        />
      </div>

      <div className="mt-3 hidden items-start gap-2 text-xs leading-5 text-slate-600 sm:flex">
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${getStatusStyle(
            building.energy_status
          )}`}
        >
          {building.energy_status}
        </span>

        <span>{getRecommendation(building)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="min-w-0 text-xs leading-4">
          <p className="text-slate-400">Latest reading</p>

          <p className="truncate font-medium text-slate-700">
            {building.latest_reading_date
              ? `${formatNumber(building.latest_reading)} kWh · ${formatShortDate(
                  building.latest_reading_date
                )}`
              : "No readings yet"}
          </p>
        </div>

        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
        >
          <Eye size={14} />
          View details
        </button>
      </div>
    </div>
  );
}

function ToastMessage({ toast, onClose }) {
  if (!toast.message) {
    return null;
  }

  const isError = toast.type === "error";

  return (
    <div className="fixed right-5 top-28 z-[60000] w-[calc(100%-2.5rem)] max-w-md">
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
          {isError ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
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
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function BuildingDetailsModal({ building, onClose }) {
  if (!building) {
    return null;
  }

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/70 p-5">
      <div className="relative z-[50001] flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="shrink-0 border-b border-slate-100 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                GIS Building Details
              </p>

              <h2 className="mt-2 break-words text-2xl font-bold leading-tight text-slate-950">
                {building.name}
              </h2>

              <p className="mt-1 text-sm font-normal text-slate-500">
                Energy status and monitoring summary.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 transition hover:bg-slate-50 hover:text-red-600"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Energy Status
              </p>

              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusStyle(
                  building.energy_status
                )}`}
              >
                {building.energy_status}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                EUI
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatDecimal(building.eui)} kWh/m²
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Total Consumption
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatNumber(building.total_consumption)} kWh
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Floor Area
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatNumber(building.floor_area)} m²
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Latest Reading
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatNumber(building.latest_reading)} kWh
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Meters / Readings
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {building.meter_count} meters • {building.reading_count}{" "}
                readings
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Building Type
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {building.building_type}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                EUI Calculation
              </p>

              <p className="mt-2 text-sm font-normal leading-6 text-slate-700">
                {formatNumber(building.total_consumption)} kWh ÷{" "}
                {formatNumber(building.floor_area)} m² ={" "}
                {formatDecimal(building.eui)} kWh/m²
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Coordinates
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-950">
                {building.latitude}, {building.longitude}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Recommendation
              </p>

              <p className="mt-2 text-sm font-normal leading-6 text-emerald-800">
                {getRecommendation(building)}
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white p-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// Kept next to the real row's grid-cols-[...] class so the two stay in step.
const MAP_ROW_COLUMNS = "1.2fr 0.9fr 0.9fr 1fr 0.9fr 1fr 0.9fr";

export default function BuildingMap() {
  const [buildings, setBuildings] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  // An id rather than the row itself, so the card shows fresh numbers after each
  // auto-refresh instead of the snapshot taken when the building was clicked.
  const [selectedId, setSelectedId] = useState(null);
  // On a phone the card covers half the map, so it waits for a tap there.
  const [isCardOpen, setIsCardOpen] = useState(() => window.innerWidth >= 640);
  const [baseLayer, setBaseLayer] = useState("map");
  const [map, setMap] = useState(null);
  const [detailsBuilding, setDetailsBuilding] = useState(null);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isLoading, setIsLoading] = useState(false);
  const mapSectionRef = useRef(null);

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

  async function fetchMapRows() {
    const response = await apiFetch(`${API_BASE_URL}/map/buildings`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load GIS map data.");
    }

    return Array.isArray(data) ? data.map(normalizeBuildingMapRow) : [];
  }

  async function fetchBuildingsFallback() {
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

  function buildMapRowsFromFallback(buildingData, meterData, readingData) {
    return buildingData.map((building) => {
      const buildingMeters = meterData.filter(
        (meter) => Number(meter.building_id) === Number(building.building_id)
      );

      const meterIds = buildingMeters.map((meter) => Number(meter.meter_id));

      const buildingReadings = readingData.filter((reading) =>
        meterIds.includes(Number(reading.meter_id))
      );

      const totalConsumption = buildingReadings.reduce(
        (sum, reading) => sum + Number(reading.reading_value || 0),
        0
      );

      const sortedReadings = [...buildingReadings].sort((a, b) => {
        const dateA = new Date(a.reading_date).getTime() || 0;
        const dateB = new Date(b.reading_date).getTime() || 0;

        return dateB - dateA;
      });

      const latestReading = sortedReadings[0];

      const averageAccuracy = getAverageOcrAccuracy(buildingReadings) ?? 0;

      const verifiedCount = buildingReadings.filter(
        (reading) => reading.is_verified
      ).length;

      const pendingCount = buildingReadings.filter(
        (reading) => !reading.is_verified
      ).length;

      const eui = computeEui(totalConsumption, building.floor_area);

      return {
        building_id: building.building_id,
        name: building.name,
        latitude: building.latitude,
        longitude: building.longitude,
        floor_area: building.floor_area,
        building_type: building.building_type,
        building_status: building.building_status,
        energy_status: getEnergyStatus(totalConsumption, building.floor_area),
        eui,
        meter_count: buildingMeters.length,
        reading_count: buildingReadings.length,
        total_consumption: totalConsumption,
        latest_reading: latestReading?.reading_value || 0,
        latest_reading_date: latestReading?.reading_date || "",
        average_accuracy: averageAccuracy,
        verified_count: verifiedCount,
        pending_count: pendingCount,
      };
    });
  }

  async function refreshData() {
    setIsLoading(true);

    try {
      let mapRows = [];

      try {
        // /map/buildings already returns per-building totals and energy status, so
        // on the happy path there is nothing else to fetch. This used to pull the
        // entire meters and readings tables up front, every 30 seconds, and then
        // throw both away whenever this call succeeded.
        mapRows = await fetchMapRows();
      } catch {
        // Only the fallback needs the raw tables to aggregate client-side.
        const [buildingData, meterData, readingData] = await Promise.all([
          fetchBuildingsFallback(),
          fetchMeters(),
          fetchReadings(),
        ]);

        mapRows = buildMapRowsFromFallback(buildingData, meterData, readingData);

        // The fallback aggregates differently from the backend (see
        // buildMapRowsFromFallback), so say so rather than silently showing
        // numbers computed a different way.
        showToast(
          "Map totals were calculated locally because the map service did not respond. Figures may differ slightly.",
          "error"
        );
      }

      setBuildings(mapRows);
    } catch (error) {
      console.error("GIS map refresh error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(refreshData, {
    intervalMs: AUTO_REFRESH_MS,
    enabled: !detailsBuilding,
    runOnMount: true,
  });

  const buildingsWithCoordinates = useMemo(() => {
    return buildings.filter((building) => {
      return (
        building.latitude !== "" &&
        building.longitude !== "" &&
        !Number.isNaN(Number(building.latitude)) &&
        !Number.isNaN(Number(building.longitude))
      );
    });
  }, [buildings]);

  const filteredBuildings = useMemo(() => {
    return buildingsWithCoordinates.filter((building) => {
      const searchValue = query.toLowerCase();

      const matchesStatus =
        statusFilter === "All" || building.energy_status === statusFilter;

      const matchesSearch =
        building.name.toLowerCase().includes(searchValue) ||
        building.building_type.toLowerCase().includes(searchValue) ||
        building.energy_status.toLowerCase().includes(searchValue) ||
        String(building.total_consumption).includes(searchValue) ||
        String(building.eui).includes(searchValue) ||
        String(building.floor_area).includes(searchValue) ||
        String(building.latitude).includes(searchValue) ||
        String(building.longitude).includes(searchValue);

      return matchesStatus && matchesSearch;
    });
  }, [buildingsWithCoordinates, statusFilter, query]);

  const listBuildings = useMemo(() => {
    return [...filteredBuildings].sort(
      (a, b) =>
        (STATUS_RANK[a.energy_status] ?? 4) -
          (STATUS_RANK[b.energy_status] ?? 4) || b.eui - a.eui
    );
  }, [filteredBuildings]);

  const statusCounts = useMemo(() => {
    const counts = { All: buildingsWithCoordinates.length };

    buildingsWithCoordinates.forEach((building) => {
      counts[building.energy_status] =
        (counts[building.energy_status] || 0) + 1;
    });

    return counts;
  }, [buildingsWithCoordinates]);

  // Tells the two empty cases apart: nothing mapped yet vs. filters hiding
  // everything. They need opposite calls to action.
  const hasActiveFilters = query.trim() !== "" || statusFilter !== "All";

  function clearFilters() {
    setQuery("");
    setStatusFilter("All");
  }

  const activeBuilding =
    filteredBuildings.find((building) => building.building_id === selectedId) ||
    listBuildings[0] ||
    null;

  // Re-frame only when the set of visible buildings actually changes. The old map
  // flew back to the selected building on every render, so each 30-second refresh
  // and every keystroke in the search box undid the user's panning.
  const boundsKey = filteredBuildings
    .map((building) => `${building.building_id}:${building.latitude},${building.longitude}`)
    .join(";");

  useEffect(() => {
    if (!map) {
      return;
    }

    map.invalidateSize();
    fitMapToBuildings(map, filteredBuildings, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey]);

  function selectBuilding(building, { scrollToMap = false } = {}) {
    setSelectedId(building.building_id);
    setIsCardOpen(true);

    if (scrollToMap) {
      mapSectionRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    }

    if (!map) {
      return;
    }

    const latLng = L.latLng(toLatLng(building));
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);

    // On a narrow map the details card covers the lower half, so park the
    // building above centre instead of underneath the card.
    const size = map.getSize();
    const offsetY = size.x < 640 ? Math.round(size.y * 0.22) : 0;
    const target = offsetY
      ? map.unproject(map.project(latLng, zoom).add([0, offsetY]), zoom)
      : latLng;

    if (prefersReducedMotion()) {
      map.setView(target, zoom, { animate: false });
    } else {
      map.flyTo(target, zoom, { duration: 0.6 });
    }
  }

  const normalCount = buildings.filter(
    (building) => building.energy_status === "Normal"
  ).length;

  const highCount = buildings.filter(
    (building) => building.energy_status === "High"
  ).length;

  const criticalCount = buildings.filter(
    (building) => building.energy_status === "Critical"
  ).length;

  const averageEui = buildings.length
    ? buildings.reduce((sum, building) => sum + Number(building.eui || 0), 0) /
      buildings.length
    : 0;

  const tileLayer = BASE_LAYERS[baseLayer];

  return (
    <div className="relative z-0 space-y-6">
      <ToastMessage toast={toast} onClose={hideToast} />

      <PageHeader
        eyebrow="GIS Energy Map"
        title="Building Energy Map"
        subtitle="View building locations and EUI-based energy status."
        icon={MapPinned}
        status={isLoading ? "Syncing map data" : `${filteredBuildings.length} Visible`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoading}
        intervalMs={AUTO_REFRESH_MS}
        actions={
          <>
            <HeaderActionButton
              icon={Eye}
              onClick={() => activeBuilding && setDetailsBuilding(activeBuilding)}
              disabled={!activeBuilding}
            >
              View Selected
            </HeaderActionButton>

            <HeaderActionButton icon={Navigation}>
              {buildingsWithCoordinates.length} Mapped
            </HeaderActionButton>

            <HeaderActionButton icon={Zap} variant="dark">
              Avg EUI {formatDecimal(averageEui)}
            </HeaderActionButton>
          </>
        }
      />

      <section className="relative z-0 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Mapped Buildings"
          value={buildingsWithCoordinates.length}
          icon={MapPinned}
          description="Buildings with valid coordinates"
        />

        <StatCard
          title="Normal"
          value={normalCount}
          icon={CheckCircle2}
          tone="green"
          description="Within normal EUI range"
        />

        <StatCard
          title="High"
          value={highCount}
          icon={Flame}
          tone="amber"
          description="Needs monitoring"
        />

        <StatCard
          title="Critical"
          value={criticalCount}
          icon={AlertTriangle}
          tone="red"
          description="Needs immediate review"
        />
      </section>

      {buildingsWithCoordinates.length === 0 && !isLoading && (
        <EmptyState
          variant="blocked"
          icon={AlertTriangle}
          title="No GIS coordinates available"
          description="Buildings only appear as map markers once they have a latitude and longitude. Add coordinates on the Buildings page."
          className="relative z-0"
        />
      )}

      <section
        ref={mapSectionRef}
        className="energy-gis-map relative z-0 grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[660px] lg:grid-cols-[320px_minmax(0,1fr)]"
      >
        <aside className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">
                  Buildings
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  {filteredBuildings.length} of {buildingsWithCoordinates.length}{" "}
                  shown on the map
                </p>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Clear filters
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition focus-within:border-emerald-600 focus-within:bg-white">
              <Search size={16} className="shrink-0 text-slate-400" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, type, EUI..."
                aria-label="Search buildings"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              )}
            </label>

            <div role="group" aria-label="Filter by EUI status">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                EUI status
              </p>

              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((status) => {
                  const isActive = statusFilter === status;

                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setStatusFilter(status)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {status !== "All" && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: getStatusColor(status) }}
                        />
                      )}
                      {status}
                      <span
                        className={`tabular-nums ${
                          isActive ? "text-white/60" : "text-slate-400"
                        }`}
                      >
                        {statusCounts[status] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="max-h-[272px] flex-1 overflow-y-auto p-2 lg:max-h-none">
            {listBuildings.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {hasActiveFilters
                    ? "No buildings match"
                    : isLoading
                    ? "Loading buildings..."
                    : "No mapped buildings yet"}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {hasActiveFilters
                    ? "Try another search or status."
                    : "Buildings need a latitude and longitude to appear here."}
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {listBuildings.map((building) => {
                  const isActive =
                    activeBuilding?.building_id === building.building_id;

                  return (
                    <li key={building.building_id}>
                      <button
                        type="button"
                        onClick={() => selectBuilding(building)}
                        aria-current={isActive ? "true" : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                          isActive
                            ? "bg-emerald-50/70 ring-1 ring-inset ring-emerald-200"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${getStatusTint(
                            building.energy_status
                          )}`}
                        >
                          <Building2 size={17} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {building.name}
                          </span>

                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{
                                background: getStatusColor(building.energy_status),
                              }}
                            />
                            {building.energy_status} · {building.building_type}
                          </span>
                        </span>

                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-slate-900">
                            {formatEui(building)}
                          </span>

                          <span className="block text-[10px] text-slate-400">
                            kWh/m²
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-4 text-slate-400">
            Normal ≤ {EUI_HIGH_THRESHOLD} · High &gt; {EUI_HIGH_THRESHOLD} ·
            Critical &gt; {EUI_CRITICAL_THRESHOLD} kWh/m²
          </p>
        </aside>

        <div className="energy-map-shell h-[440px] sm:h-[520px] lg:h-full">
          <MapContainer
            ref={setMap}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            maxZoom={MAP_MAX_ZOOM}
            zoomControl={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              key={baseLayer}
              url={tileLayer.url}
              attribution={tileLayer.attribution}
              maxZoom={MAP_MAX_ZOOM}
              maxNativeZoom={tileLayer.maxNativeZoom}
              className={tileLayer.className}
            />

            {filteredBuildings.map((building) => {
              const isSelected =
                isCardOpen && activeBuilding?.building_id === building.building_id;

              return (
                <Marker
                  key={building.building_id}
                  position={toLatLng(building)}
                  icon={getMarkerIcon(building, isSelected)}
                  zIndexOffset={isSelected ? 1000 : 0}
                  eventHandlers={{
                    click: () => selectBuilding(building),
                  }}
                >
                  {!isSelected && (
                    <Tooltip
                      direction="top"
                      offset={[0, -4]}
                      opacity={1}
                      className="energy-map-tooltip"
                    >
                      <span className="block text-xs font-semibold">
                        {building.name}
                      </span>

                      <span className="block text-[11px] text-white/70">
                        {building.energy_status} · {formatEui(building)} kWh/m²
                      </span>
                    </Tooltip>
                  )}
                </Marker>
              );
            })}
          </MapContainer>

          <div
            role="group"
            aria-label="Base map"
            className="absolute left-3 top-3 z-[1000] inline-flex rounded-full border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur"
          >
            {Object.entries(BASE_LAYERS).map(([key, layer]) => {
              const LayerIcon = layer.icon;
              const isActive = baseLayer === key;

              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setBaseLayer(key)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <LayerIcon size={14} />
                  {layer.label}
                </button>
              );
            })}
          </div>

          <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
            <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md backdrop-blur">
              <MapControlButton label="Zoom in" onClick={() => map?.zoomIn()}>
                <Plus size={16} />
              </MapControlButton>

              <MapControlButton label="Zoom out" onClick={() => map?.zoomOut()}>
                <Minus size={16} />
              </MapControlButton>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md backdrop-blur">
              <MapControlButton
                label="Fit all buildings"
                onClick={() => map && fitMapToBuildings(map, filteredBuildings)}
              >
                <Scan size={16} />
              </MapControlButton>
            </div>
          </div>

          {isLoading && buildings.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-[1000] -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-md backdrop-blur">
              Loading map data...
            </div>
          )}

          {activeBuilding && isCardOpen && (
            <div className="absolute inset-x-3 bottom-3 z-[1000] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[360px]">
              <SelectedBuildingCard
                building={activeBuilding}
                onClose={() => setIsCardOpen(false)}
                onViewDetails={() => setDetailsBuilding(activeBuilding)}
              />
            </div>
          )}
        </div>
      </section>

      <section className="relative z-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              GIS Building Records
            </h2>

            <p className="mt-1 text-sm font-normal text-slate-500">
              Location-based EUI and monitoring summary.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {filteredBuildings.length} buildings shown
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_1fr_0.9fr_1fr_0.9fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              <div>Building</div>
              <div>Total kWh</div>
              <div>Floor Area</div>
              <div>EUI</div>
              <div>Meters</div>
              <div>Coordinates</div>
              <div>Status</div>
            </div>

            {isLoading && buildings.length === 0 ? (
              <SkeletonRows columns={MAP_ROW_COLUMNS} rows={5} />
            ) : filteredBuildings.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  variant="filtered"
                  icon={Search}
                  title="No buildings match your filters"
                  description="Try a different search term, or reset the filters to see every mapped building."
                  action={
                    <HeaderActionButton icon={X} onClick={clearFilters}>
                      Clear filters
                    </HeaderActionButton>
                  }
                  className="m-4"
                />
              ) : (
                <EmptyState
                  icon={MapPinned}
                  title="No mapped buildings yet"
                  description="Buildings with latitude and longitude appear here alongside their EUI status."
                  className="m-4"
                />
              )
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBuildings.map((building) => (
                  <button
                    key={building.building_id}
                    type="button"
                    onClick={() => selectBuilding(building, { scrollToMap: true })}
                    className={`grid w-full grid-cols-[1.2fr_0.9fr_0.9fr_1fr_0.9fr_1fr_0.9fr] items-center px-4 py-4 text-left text-sm transition ${
                      activeBuilding?.building_id === building.building_id
                        ? "bg-emerald-50/60"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-950">
                        {building.name}
                      </p>

                      <p className="mt-1 text-xs font-normal text-slate-400">
                        {building.verified_count} verified /{" "}
                        {building.pending_count} review
                      </p>
                    </div>

                    <div className="font-semibold text-slate-950">
                      {formatNumber(building.total_consumption)} kWh
                    </div>

                    <div className="font-medium text-slate-600">
                      {formatNumber(building.floor_area)} m²
                    </div>

                    <div className="font-semibold text-emerald-700">
                      {formatDecimal(building.eui)} kWh/m²
                    </div>

                    <div className="font-semibold text-slate-700">
                      {building.meter_count}
                    </div>

                    <div className="font-medium text-slate-600">
                      {building.latitude}, {building.longitude}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusStyle(
                          building.energy_status
                        )}`}
                      >
                        {building.energy_status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <BuildingDetailsModal
        building={detailsBuilding}
        onClose={() => setDetailsBuilding(null)}
      />
    </div>
  );
}
