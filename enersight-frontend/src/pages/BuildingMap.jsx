import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Eye,
  Flame,
  LocateFixed,
  MapPinned,
  Navigation,
  Search,
  X,
  Zap,
} from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import PageHeader from "../components/PageHeader";
import HeaderActionButton from "../components/HeaderActionButton";
import { useAutoRefresh } from "../hooks/useAutoRefresh";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
const AUTO_REFRESH_MS = 30000;

const DEFAULT_CENTER = [7.3019, 125.6852];
const STATUS_OPTIONS = ["All Status", "Normal", "High", "Critical", "No Data"];

function computeEui(totalConsumption, floorArea) {
  const consumption = Number(totalConsumption || 0);
  const area = Number(floorArea || 0);

  if (consumption <= 0 || area <= 0) {
    return 0;
  }

  return consumption / area;
}

function getEnergyStatus(totalConsumption, floorArea) {
  const consumption = Number(totalConsumption || 0);
  const area = Number(floorArea || 0);
  const eui = computeEui(consumption, area);

  if (consumption <= 0 || area <= 0) {
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
    ocr_accuracy: Number(reading.ocr_accuracy || 0),
    is_verified: Boolean(reading.is_verified),
  };
}

function formatNumber(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "0";
  }

  return Math.round(numericValue).toLocaleString();
}

function formatDecimal(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "0.00";
  }

  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) {
    return "No latest reading";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
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

function createMarkerIcon(status) {
  const color = getStatusColor(status);

  return L.divIcon({
    className: "energy-marker",
    html: `
      <div style="
        width: 30px;
        height: 30px;
        border-radius: 9999px;
        background: ${color};
        border: 4px solid white;
        box-shadow: 0 12px 25px rgba(15, 23, 42, 0.28);
      "></div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function MapFlyTo({ center }) {
  const map = useMap();

  useEffect(() => {
    if (!center) {
      return;
    }

    map.flyTo(center, 17, {
      animate: true,
      duration: 0.7,
    });
  }, [center, map]);

  return null;
}

function ToastMessage({ toast, onClose }) {
  if (!toast.message) {
    return null;
  }

  const isError = toast.type === "error";

  return (
    <div className="fixed right-5 top-28 z-[60000] w-[calc(100%-2.5rem)] max-w-md">
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
          {isError ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
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
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone = "dark", description }) {
  const palette = {
    green:  { bg: "border-emerald-100 bg-emerald-50", title: "text-emerald-700", value: "text-emerald-800", icon: "bg-emerald-700 text-white" },
    amber:  { bg: "border-amber-100 bg-amber-50",     title: "text-amber-700",   value: "text-amber-800",   icon: "bg-amber-500 text-white" },
    red:    { bg: "border-red-100 bg-red-50",         title: "text-red-700",     value: "text-red-800",     icon: "bg-red-500 text-white" },
    blue:   { bg: "border-blue-100 bg-blue-50",       title: "text-blue-700",    value: "text-blue-800",    icon: "bg-blue-600 text-white" },
    dark:   { bg: "border-slate-200 bg-white",        title: "text-slate-500",   value: "text-slate-950",   icon: "bg-slate-950 text-lime-300" },
  };
  const c = palette[tone] ?? palette.dark;

  return (
    <div className={`rounded-[1.7rem] border p-5 shadow-sm ${c.bg}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className={`text-sm font-black ${c.title}`}>{title}</p>
          <p className={`mt-2 text-3xl font-black leading-none ${c.value}`}>{value}</p>
        </div>
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${c.icon}`}>
          <Icon size={23} />
        </div>
      </div>
      <p className={`text-xs font-bold leading-5 ${c.title}`}>{description}</p>
    </div>
  );
}

function BuildingDetailsModal({ building, onClose }) {
  if (!building) {
    return null;
  }

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/70 p-5">
      <div className="relative z-[50001] flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/40">
        <div className="shrink-0 border-b border-slate-100 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
                GIS Building Details
              </p>

              <h2 className="mt-2 break-words text-2xl font-black leading-tight text-slate-950">
                {building.name}
              </h2>

              <p className="mt-1 text-sm font-bold text-slate-500">
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
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Energy Status
              </p>

              <span
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                  building.energy_status
                )}`}
              >
                {building.energy_status}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                EUI
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {formatDecimal(building.eui)} kWh/m²
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Total Consumption
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {formatNumber(building.total_consumption)} kWh
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Floor Area
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {formatNumber(building.floor_area)} m²
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Latest Reading
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {formatNumber(building.latest_reading)} kWh
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Meters / Readings
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {building.meter_count} meters • {building.reading_count}{" "}
                readings
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Building Type
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {building.building_type}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                EUI Calculation
              </p>

              <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                {formatNumber(building.total_consumption)} kWh ÷{" "}
                {formatNumber(building.floor_area)} m² ={" "}
                {formatDecimal(building.eui)} kWh/m²
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Coordinates
              </p>

              <p className="mt-2 text-lg font-black text-slate-950">
                {building.latitude}, {building.longitude}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                Recommendation
              </p>

              <p className="mt-2 text-sm font-bold leading-6 text-emerald-800">
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
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
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

export default function BuildingMap() {
  const [buildings, setBuildings] = useState([]);
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [buildingFilter, setBuildingFilter] = useState("All Buildings");
  const [query, setQuery] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [detailsBuilding, setDetailsBuilding] = useState(null);
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

      const averageAccuracy = buildingReadings.length
        ? buildingReadings.reduce(
            (sum, reading) => sum + Number(reading.ocr_accuracy || 0),
            0
          ) / buildingReadings.length
        : 0;

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
      const [meterData, readingData] = await Promise.all([
        fetchMeters(),
        fetchReadings(),
      ]);

      let mapRows = [];

      try {
        mapRows = await fetchMapRows();
      } catch {
        const buildingData = await fetchBuildingsFallback();
        mapRows = buildMapRowsFromFallback(buildingData, meterData, readingData);
      }

      setMeters(meterData);
      setReadings(readingData);
      setBuildings(mapRows);

      if (mapRows.length > 0) {
        setSelectedBuilding((current) => current || mapRows[0]);
      }
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
        statusFilter === "All Status" ||
        building.energy_status === statusFilter;

      const matchesBuilding =
        buildingFilter === "All Buildings" ||
        building.name === buildingFilter;

      const matchesSearch =
        building.name.toLowerCase().includes(searchValue) ||
        building.building_type.toLowerCase().includes(searchValue) ||
        building.energy_status.toLowerCase().includes(searchValue) ||
        String(building.total_consumption).includes(searchValue) ||
        String(building.eui).includes(searchValue) ||
        String(building.floor_area).includes(searchValue) ||
        String(building.latitude).includes(searchValue) ||
        String(building.longitude).includes(searchValue);

      return matchesStatus && matchesBuilding && matchesSearch;
    });
  }, [buildingsWithCoordinates, statusFilter, buildingFilter, query]);

  const activeBuilding =
    selectedBuilding &&
    filteredBuildings.some(
      (building) => building.building_id === selectedBuilding.building_id
    )
      ? selectedBuilding
      : filteredBuildings[0] || buildingsWithCoordinates[0] || null;

  const mapCenter = activeBuilding
    ? [Number(activeBuilding.latitude), Number(activeBuilding.longitude)]
    : DEFAULT_CENTER;

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

  return (
    <div className="relative z-0 space-y-6 font-[Nunito]">
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

      <section className="relative z-0 rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={buildingFilter}
            onChange={(event) => {
              setBuildingFilter(event.target.value);

              const target = buildings.find(
                (building) => building.name === event.target.value
              );

              if (target) {
                setSelectedBuilding(target);
              }
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
          >
            <option value="All Buildings">All Buildings</option>

            {buildingsWithCoordinates.map((building) => (
              <option key={building.building_id} value={building.name}>
                {building.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2 xl:col-span-1">
            <Search size={18} className="text-slate-400" />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search building, status, EUI, coordinates..."
              className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      </section>

      {buildingsWithCoordinates.length === 0 && (
        <section className="relative z-0 rounded-[1.7rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white">
              <AlertTriangle size={22} />
            </div>

            <div>
              <h2 className="text-lg font-black text-amber-900">
                No GIS coordinates available
              </h2>

              <p className="mt-1 text-sm font-bold leading-6 text-amber-700">
                Add building coordinates to display map markers.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="relative z-0 grid gap-6 lg:grid-cols-2">
        <div className="relative h-[320px] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-sm sm:h-[420px] md:h-[520px] lg:h-[680px]">
          <MapContainer
            center={mapCenter}
            zoom={17}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <MapFlyTo center={mapCenter} />

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredBuildings.map((building) => (
              <Marker
                key={building.building_id}
                position={[
                  Number(building.latitude),
                  Number(building.longitude),
                ]}
                icon={createMarkerIcon(building.energy_status)}
                eventHandlers={{
                  click: () => setSelectedBuilding(building),
                }}
              >
                <Popup className="custom-popup">
                  <div className="min-w-[230px] p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                          Building
                        </p>

                        <h3 className="text-lg font-black text-slate-950">
                          {building.name}
                        </h3>
                      </div>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                          building.energy_status
                        )}`}
                      >
                        {building.energy_status}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm font-bold text-slate-600">
                      <p>Type: {building.building_type}</p>
                      <p>
                        Total: {formatNumber(building.total_consumption)} kWh
                      </p>
                      <p>Area: {formatNumber(building.floor_area)} m²</p>
                      <p>EUI: {formatDecimal(building.eui)} kWh/m²</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDetailsBuilding(building)}
                      className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                    >
                      View Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="pointer-events-none absolute left-5 top-5 z-[1000] rounded-2xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              EUI Status
            </p>

            <div className="mt-2 flex flex-wrap gap-3 text-xs font-black">
              {["Normal", "High", "Critical", "No Data"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: getStatusColor(item) }}
                  />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="relative z-10 flex flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:h-[680px]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                Selected Building
              </p>

              <h3 className="mt-1 text-lg font-black leading-tight text-slate-950">
                {activeBuilding?.name || "No building selected"}
              </h3>
            </div>

            {activeBuilding && (
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                  activeBuilding.energy_status
                )}`}
              >
                {activeBuilding.energy_status}
              </span>
            )}
          </div>

          {activeBuilding ? (
            <div className="flex flex-1 flex-col gap-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Energy Use Intensity
                  </p>

                  <p className="mt-1 text-base font-black text-slate-950">
                    {formatDecimal(activeBuilding.eui)} kWh/m²
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Total Energy Used
                  </p>

                  <p className="mt-1 text-base font-black text-slate-950">
                    {formatNumber(activeBuilding.total_consumption)} kWh
                  </p>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Floor Area
                  </p>

                  <p className="mt-1 text-base font-black text-slate-950">
                    {formatNumber(activeBuilding.floor_area)}{" "}
                    <span className="text-xs font-bold text-slate-500">m²</span>
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Readings
                  </p>

                  <p className="mt-1 text-base font-black text-slate-950">
                    {activeBuilding.reading_count}
                  </p>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Meters
                  </p>

                  <p className="mt-1 text-base font-black text-slate-950">
                    {activeBuilding.meter_count}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Latest Reading
                  </p>

                  <p className="mt-1 text-base font-black text-slate-950">
                    {formatNumber(activeBuilding.latest_reading)} kWh
                  </p>

                  <p className="mt-0.5 text-xs font-bold text-slate-500">
                    {formatDateTime(activeBuilding.latest_reading_date)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Map Location
                </p>

                <p className="mt-1 text-sm font-bold leading-5 text-slate-700">
                  {activeBuilding.latitude}, {activeBuilding.longitude}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-900">
                <LocateFixed className="mb-1" size={16} />
                {getRecommendation(activeBuilding)}
              </div>

              <button
                type="button"
                onClick={() => setDetailsBuilding(activeBuilding)}
                className="mt-auto flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                <Eye size={16} />
                View Full Details
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
              Select a building marker from the map.
            </div>
          )}
        </aside>
      </section>

      <section className="relative z-0 rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              GIS Building Records
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Location-based EUI and monitoring summary.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
            {filteredBuildings.length} buildings shown
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_1fr_0.9fr_1fr_0.9fr] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>Building</div>
              <div>Total kWh</div>
              <div>Floor Area</div>
              <div>EUI</div>
              <div>Meters</div>
              <div>Coordinates</div>
              <div>Status</div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading GIS map data...
              </div>
            ) : filteredBuildings.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                No building map records found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBuildings.map((building) => (
                  <button
                    key={building.building_id}
                    type="button"
                    onClick={() => setSelectedBuilding(building)}
                    className="grid w-full grid-cols-[1.2fr_0.9fr_0.9fr_1fr_0.9fr_1fr_0.9fr] items-center px-4 py-4 text-left text-sm transition hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-black text-slate-950">
                        {building.name}
                      </p>

                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {building.verified_count} verified /{" "}
                        {building.pending_count} review
                      </p>
                    </div>

                    <div className="font-black text-slate-950">
                      {formatNumber(building.total_consumption)} kWh
                    </div>

                    <div className="font-bold text-slate-600">
                      {formatNumber(building.floor_area)} m²
                    </div>

                    <div className="font-black text-emerald-700">
                      {formatDecimal(building.eui)} kWh/m²
                    </div>

                    <div className="font-black text-slate-700">
                      {building.meter_count}
                    </div>

                    <div className="font-bold text-slate-600">
                      {building.latitude}, {building.longitude}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
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