import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Eye,
  FileImage,
  ImagePlus,
  Loader2,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import HeaderActionButton from "../components/HeaderActionButton";
import EmptyState from "../components/EmptyState";
import SkeletonRows from "../components/SkeletonRows";
import MeterRoundsList from "../components/MeterRoundsList";
import MeterReadingHistory from "../components/MeterReadingHistory";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import ToastMessage from "../components/ToastMessage";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { formatNumber } from "../utils/format";
import { getOcrScore } from "../utils/readingQuality";
import { scalePhotoForUpload } from "../utils/photoResize";
import {
  checkReadingPlausibility,
  getLatestReading,
  getUsualDailyUse,
} from "../utils/readingPlausibility";
import {
  buildMeterRounds,
  daysBetween,
  getMeterHistory,
  getNextMeterToRead,
  getRecentMonths,
} from "../utils/meterRounds";

// How many months the reading-period picker offers, the current one first.
const PERIOD_MONTHS = 6;
const AUTO_REFRESH_MS = 30000;
const PAGE_SIZE = 20;
// A full-size phone photo takes up to a minute on a laptop CPU, and the backend
// queues a scan for up to 90s behind another one. Past this, stop waiting.
const OCR_TIMEOUT_MS = 180000;

function getDefaultReadingDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 16);
}

const emptyForm = {
  meter_id: "",
  reading_value: "",
  reading_date: getDefaultReadingDate(),
  image_path: "No photo selected",
  ocr_accuracy: 0,
  // The digits OCR proposed for this photo, kept even if the person changes the
  // value, so a saved correction records what the scan got wrong.
  ocr_reading: "",
};

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
    meter_type: meter.meter_type || meter.meter_category || "Digital",
    status: meter.status || "Active",
  };
}

function normalizeReading(reading) {
  const presentReading = Number(reading.reading_value ?? 0);
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
    ocr_accuracy: getOcrScore(reading.ocr_accuracy),
    ocr_reading: reading.ocr_reading || "",
    is_verified: Boolean(reading.is_verified),
  };
}

/** True when the saved value is not what OCR read, i.e. a person corrected it. */
function isCorrectedFromOcr(ocrReading, value) {
  if (!ocrReading || String(value ?? "").trim() === "") {
    return false;
  }

  return Number(ocrReading) !== Number(value);
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

function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);

  return localDate.toISOString().slice(0, 16);
}

function getStatusStyle(isVerified) {
  if (isVerified) {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  return "border-amber-100 bg-amber-50 text-amber-700";
}


function getOcrStatusLabel({
  selectedPhotoFile,
  isRunningOcr,
  readingValue,
  needsReview,
}) {
  if (isRunningOcr) {
    return "Scanning image...";
  }

  if (!selectedPhotoFile) {
    return "Waiting for photo";
  }

  if (readingValue) {
    if (needsReview) {
      return "Check the number";
    }

    return "Detected successfully";
  }

  return "Photo ready for OCR";
}

function getOcrStatusStyle({
  selectedPhotoFile,
  isRunningOcr,
  readingValue,
  needsReview,
}) {
  if (isRunningOcr) {
    return "border-blue-100 bg-blue-50 text-blue-700";
  }

  if (!selectedPhotoFile) {
    return "border-slate-100 bg-slate-50 text-slate-600";
  }

  if (readingValue) {
    if (needsReview) {
      return "border-amber-100 bg-amber-50 text-amber-700";
    }

    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  return "border-amber-100 bg-amber-50 text-amber-700";
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600";

const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

function Field({ label, children, helper }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
        {label}
      </span>

      {children}

      {helper && (
        <p className="mt-1.5 text-xs font-normal leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </label>
  );
}

function SummaryCell({ label, value, caption, children }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-[22px] font-bold leading-tight text-slate-900">{value}</p>
      {caption && <p className="mt-1 text-xs font-normal text-slate-500">{caption}</p>}
      {children}
    </div>
  );
}

function CalcRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-t border-slate-100 px-3.5 py-2.5 first:border-t-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function formatShortDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function formatDays(days) {
  if (days <= 0) {
    return "Same day";
  }

  return days === 1 ? "1 day" : `${days} days`;
}


function ReadingDetailsModal({ reading, meters, buildings, onClose }) {
  if (!reading) {
    return null;
  }

  const meter = meters.find(
    (item) => Number(item.meter_id) === Number(reading.meter_id)
  );

  const building = buildings.find(
    (item) => Number(item.building_id) === Number(meter?.building_id)
  );

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Reading Record
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Reading #{reading.record_id}
            </h2>

            <p className="mt-1 text-sm font-normal text-slate-500">
              OCR-assisted consumption reading details.
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Present Reading
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {formatNumber(reading.reading_value)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Previous Reading
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-600">
              {formatNumber(reading.previous_reading ?? 0)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              kWh Consumed
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">
              {formatNumber(Math.max(reading.reading_value - (reading.previous_reading ?? 0), 0))} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Meter
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {meter?.serial_no || `Meter #${reading.meter_id}`}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Building
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {building?.name || "Unknown building"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Reading Date
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {formatDateTime(reading.reading_date)}
            </p>
          </div>

          {/* The photo the reading came from. Before the backend kept the file and
              served it, this panel showed only a filename that pointed at nothing. */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Meter Photo
            </p>

            {reading.image_path && reading.image_path.startsWith("/uploads/") ? (
              <div className="mt-3 space-y-2">
                <a
                  href={`${API_BASE_URL}${reading.image_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <img
                    src={`${API_BASE_URL}${reading.image_path}`}
                    alt={`Meter photo for reading #${reading.record_id}`}
                    className="max-h-72 w-full object-contain"
                    loading="lazy"
                  />
                </a>
                <p className="break-words text-xs font-normal text-slate-500">
                  {reading.image_path}
                </p>
                {reading.ocr_reading && (
                  <p className="text-sm font-normal text-slate-600">
                    OCR read{" "}
                    <span className="font-semibold text-slate-950">
                      {reading.ocr_reading}
                    </span>
                    {isCorrectedFromOcr(reading.ocr_reading, reading.reading_value)
                      ? `; corrected by hand to ${formatNumber(reading.reading_value)}.`
                      : "; saved as read."}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 break-words text-sm font-normal text-slate-500">
                {reading.image_path
                  ? `No stored photo (${reading.image_path})`
                  : "No photo attached. This reading was entered manually."}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Verification Status
            </p>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusStyle(
                reading.is_verified
              )}`}
            >
              {reading.is_verified ? "Verified" : "Needs Review"}
            </span>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-slate-100 bg-white p-6">
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
  );
}

// Kept next to the real row's grid-cols-[...] class so the two stay in step.
const READING_ROW_COLUMNS = "90px 1.2fr 1.1fr 1fr 130px 180px";

const UploadOCR = () => {

  const [meters, setMeters] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [readings, setReadings] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailsReading, setDetailsReading] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0);
  // The in-flight scan's AbortController. A ref, not state, so a second photo
  // picked in the same render still sees that a scan is running.
  const ocrAbortRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [rawReadingValue, setRawReadingValue] = useState("");
  const [correctedReadingValue, setCorrectedReadingValue] = useState("");
  const [correctionApplied, setCorrectionApplied] = useState(false);
  // What each engine read and which one the ensemble went with. The backend has
  // always returned this; nothing rendered it until now.
  const [ensembleCandidates, setEnsembleCandidates] = useState([]);
  const [ensembleDecision, setEnsembleDecision] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [ocrRawText, setOcrRawText] = useState("");
  const [previousReadingValue, setPreviousReadingValue] = useState(0);
  const [isFirstReading, setIsFirstReading] = useState(false);
  const [isFetchingPrevious, setIsFetchingPrevious] = useState(false);
  // Bumped after a save so the meter's "previous reading" is fetched again even
  // when the same meter stays selected (no other meter left to read).
  const [previousReloadKey, setPreviousReloadKey] = useState(0);
  const months = useMemo(() => getRecentMonths(PERIOD_MONTHS), []);
  const [periodKey, setPeriodKey] = useState(months[0].key);

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
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [toast.message]);

  // Leaving the page drops the pending scan instead of updating an unmounted form.
  useEffect(() => () => ocrAbortRef.current?.abort(), []);

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

  async function fetchMeters() {
    const response = await apiFetch(`${API_BASE_URL}/meters/`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load meters.");
    }

    return Array.isArray(data) ? data.map(normalizeMeter) : [];
  }

  async function fetchBuildings() {
    const response = await apiFetch(`${API_BASE_URL}/buildings/`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load buildings.");
    }

    return Array.isArray(data) ? data.map(normalizeBuilding) : [];
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
    setIsLoadingData(true);

    try {
      const [meterData, buildingData, readingData] = await Promise.all([
        fetchMeters(),
        fetchBuildings(),
        fetchReadings(),
      ]);

      setMeters(meterData);
      setBuildings(buildingData);
      setReadings(readingData);

      // Start on the first meter still to read this month, so the page opens on
      // the next job rather than on whichever meter happens to be first.
      setForm((current) => {
        if (current.meter_id || meterData.length === 0) {
          return current;
        }

        const firstToRead = buildMeterRounds(meterData, readingData, months[0]).toRead[0];

        return {
          ...current,
          meter_id: String((firstToRead?.meter ?? meterData[0]).meter_id),
        };
      });

      if (showSuccessToast) {
        showToast("OCR data refreshed successfully.", "success");
      }
    } catch (error) {
      console.error("OCR data refresh error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoadingData(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(
    () => refreshData(false),
    {
      intervalMs: AUTO_REFRESH_MS,
      enabled: !detailsReading && !confirmation,
      runOnMount: true,
    }
  );

  const filteredReadings = useMemo(() => {
    return readings.filter((reading) => {
      const searchValue = query.toLowerCase();
      const meter = metersById.get(Number(reading.meter_id));
      const buildingName = meter
        ? buildingsById.get(Number(meter.building_id))?.name || ""
        : "";

      const matchesSearch =
        String(reading.record_id).includes(searchValue) ||
        String(reading.reading_value).includes(searchValue) ||
        String(reading.ocr_accuracy ?? "manual").includes(searchValue) ||
        reading.image_path.toLowerCase().includes(searchValue) ||
        meter?.serial_no.toLowerCase().includes(searchValue) ||
        buildingName.toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "All Status" ||
        (statusFilter === "Verified" && reading.is_verified) ||
        (statusFilter === "Needs Review" && !reading.is_verified);

      return matchesSearch && matchesStatus;
    });
  }, [readings, query, statusFilter, metersById, buildingsById]);

  // Tells the two empty cases apart: nothing saved yet vs. filters hiding
  // everything. They need opposite calls to action.
  const hasActiveFilters =
    query.trim() !== "" || statusFilter !== "All Status";

  function clearFilters() {
    setQuery("");
    setStatusFilter("All Status");
  }

  const totalPages = Math.max(1, Math.ceil(filteredReadings.length / PAGE_SIZE));

  const paginatedReadings = useMemo(
    () => filteredReadings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredReadings, currentPage]
  );

  useEffect(() => {
    // Returning to page 1 when the filters change is the intended behaviour; there
    // is nothing to derive it from without duplicating the filter state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [query, statusFilter]);

  // Loads the selected meter's last reading, which the form needs as the floor for
  // the new value. The no-meter reset runs inside the same async function so no
  // state is set synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;

    async function loadPreviousReading() {
      await Promise.resolve();

      if (cancelled) {
        return;
      }

      if (!form.meter_id) {
        setPreviousReadingValue(0);
        setIsFirstReading(false);
        return;
      }

      setIsFetchingPrevious(true);

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/readings/meter/${form.meter_id}/last`
        );
        const data = await response.json();

        if (!cancelled) {
          setPreviousReadingValue(Number(data.reading_value ?? 0));
          setIsFirstReading(!data.has_prior);
        }
      } catch {
        if (!cancelled) {
          setPreviousReadingValue(0);
          setIsFirstReading(true);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingPrevious(false);
        }
      }
    }

    loadPreviousReading();

    return () => {
      cancelled = true;
    };
  }, [form.meter_id, previousReloadKey]);

  const totalReadings = readings.length;
  const selectedMeter = getMeter(form.meter_id);

  // This period's round: which meters still need a reading and which are done.
  const period = months.find((month) => month.key === periodKey) || months[0];
  const isCurrentPeriod = period.key === months[0].key;

  const rounds = useMemo(
    () => buildMeterRounds(meters, readings, period),
    [meters, readings, period]
  );

  const nextMeterId = getNextMeterToRead(rounds.toRead, form.meter_id);
  const nextMeter = nextMeterId ? getMeter(nextMeterId) : null;

  const selectedRound = useMemo(
    () =>
      [...rounds.toRead, ...rounds.done].find(
        (entry) => Number(entry.meter.meter_id) === Number(form.meter_id)
      ) || null,
    [rounds, form.meter_id]
  );

  const meterHistory = useMemo(
    () => getMeterHistory(readings, form.meter_id, 5),
    [readings, form.meter_id]
  );

  const meterReadPercent =
    meters.length > 0 ? Math.round((rounds.done.length / meters.length) * 100) : 0;

  // Readings dated inside the period, and the measured kWh they add up to
  // (present minus previous on each, the same figure the other pages use).
  const periodReadings = useMemo(
    () =>
      readings.filter((reading) => {
        const time = new Date(reading.reading_date).getTime();
        return time >= period.start && time < period.end;
      }),
    [readings, period]
  );

  const periodKwh = periodReadings.reduce(
    (sum, reading) => sum + reading.differential,
    0
  );

  // The present reading checked against the meter's own history. Shown as the
  // value changes, so it catches an OCR misread and a typo the same way.
  const usualDailyUse = useMemo(
    () => getUsualDailyUse(readings, form.meter_id),
    [readings, form.meter_id]
  );

  const latestMeterReading = useMemo(
    () => getLatestReading(readings, form.meter_id),
    [readings, form.meter_id]
  );

  const plausibilityIssues = useMemo(
    () =>
      form.meter_id
        ? checkReadingPlausibility({
            value: form.reading_value,
            previousValue: previousReadingValue,
            // A first reading's "previous" is typed in, with no date to measure from.
            previousDate: isFirstReading ? null : latestMeterReading?.reading_date,
            readingDate: form.reading_date,
            usualDailyUse,
            serialNo: selectedMeter?.serial_no,
          })
        : [],
    [
      form.meter_id,
      form.reading_value,
      form.reading_date,
      previousReadingValue,
      isFirstReading,
      latestMeterReading,
      usualDailyUse,
      selectedMeter,
    ]
  );

  // What the other engines read, offered as one-click choices when a reading needs
  // review. On the second campus Vision meter EasyOCR read 24454 while TPS + CTC
  // read the right 20959. Readings equal in value to the current one are left out.
  const otherReadings = useMemo(() => {
    const current = String(form.reading_value || "");
    const byDigits = new Map();

    for (const voter of ensembleCandidates) {
      const digits = voter.valid ? String(voter.digits || "") : "";

      if (!digits || (current && Number(digits) === Number(current))) {
        continue;
      }

      const option = byDigits.get(digits) || { digits, labels: [] };
      option.labels.push(voter.label || voter.source);
      byDigits.set(digits, option);
    }

    return [...byDigits.values()].sort((a, b) => b.labels.length - a.labels.length);
  }, [ensembleCandidates, form.reading_value]);

  const correctedFromOcr = isCorrectedFromOcr(form.ocr_reading, form.reading_value);

  let presentReadingHelper = "Type the number on the display, or add a photo to read it.";

  if (correctedFromOcr) {
    presentReadingHelper = `OCR read ${form.ocr_reading}. Your correction is saved with the photo, which is what retraining the OCR needs.`;
  } else if (form.ocr_reading) {
    presentReadingHelper = "Filled in by OCR. Edit it if it does not match the photo.";
  }

  const consumptionKwh =
    form.reading_value && form.meter_id
      ? Math.max(Number(form.reading_value) - previousReadingValue, 0)
      : null;

  // Days since the meter's last reading, for the kWh-per-day line. A first
  // reading's previous value was typed in with no date, so it has none.
  const periodDays =
    consumptionKwh !== null && !isFirstReading && latestMeterReading
      ? daysBetween(latestMeterReading.reading_date, form.reading_date)
      : null;

  const draftHistoryRow =
    consumptionKwh !== null
      ? {
          date: form.reading_date,
          value: Number(form.reading_value),
          used: consumptionKwh,
          perDay: periodDays === null ? null : consumptionKwh / Math.max(periodDays, 1),
          source: form.ocr_reading ? "OCR" : "Manual",
        }
      : null;

  let selectedStatus = { text: "First reading", tone: "text-slate-700" };

  if (selectedRound?.periodReading) {
    selectedStatus = {
      text: `Read ${formatShortDate(selectedRound.periodReading.reading_date)}`,
      tone: "text-emerald-700",
    };
  } else if (selectedRound?.latest) {
    selectedStatus = isCurrentPeriod
      ? { text: `Due, ${formatDays(selectedRound.daysSinceLatest)}`, tone: "text-amber-800" }
      : { text: `Not read in ${period.label}`, tone: "text-amber-800" };
  }

  const ocrStatusLabel = getOcrStatusLabel({
    selectedPhotoFile,
    isRunningOcr,
    readingValue: form.reading_value,
    needsReview: needsReview || plausibilityIssues.length > 0,
  });

  const ocrStatusStyle = getOcrStatusStyle({
    selectedPhotoFile,
    isRunningOcr,
    readingValue: form.reading_value,
    needsReview: needsReview || plausibilityIssues.length > 0,
  });

  function clearOcrResult() {
    setRawReadingValue("");
    setCorrectedReadingValue("");
    setCorrectionApplied(false);
    setNeedsReview(false);
    setReviewReason("");
    setOcrRawText("");
    setEnsembleCandidates([]);
    setEnsembleDecision("");
  }

  function resetSelectedPhoto() {
    setSelectedPhotoFile(null);
    setSelectedFileName("");
    setPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return "";
    });
    clearOcrResult();
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file.", "error");
      return;
    }

    if (ocrAbortRef.current) {
      event.target.value = "";
      showToast("Wait for the current scan to finish first.", "error");
      return;
    }

    resetSelectedPhoto();

    const newPreviewUrl = URL.createObjectURL(file);

    setSelectedPhotoFile(file);
    setSelectedFileName(file.name);
    setPreviewUrl(newPreviewUrl);

    setForm((current) => ({
      ...current,
      image_path: file.name,
      reading_value: "",
      ocr_accuracy: 0,
      ocr_reading: "",
    }));

    event.target.value = "";

    // Scan the whole photo as soon as it is picked.
    if (form.meter_id) {
      runEasyOcr(file);
    } else {
      showToast("Select a meter, then press Scan photo.", "error");
    }
  }

  async function runEasyOcr(fileOverride) {
    const photoFile = fileOverride || selectedPhotoFile;

    if (!form.meter_id) {
      showToast("Please select a meter before running OCR.", "error");
      return;
    }

    if (!photoFile) {
      showToast("Please upload or take a meter photo first.", "error");
      return;
    }

    if (ocrAbortRef.current) {
      return;
    }

    const controller = new AbortController();
    ocrAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
    const startedAt = Date.now();
    const tickId = window.setInterval(() => {
      setOcrElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    setOcrElapsedSeconds(0);
    setIsRunningOcr(true);
    clearOcrResult();

    try {
      // The whole photo, scaled down first if it is larger than 2048 px.
      let uploadFile = photoFile;

      try {
        uploadFile = await scalePhotoForUpload(photoFile);
      } catch (resizeError) {
        console.error("Could not scale the photo, sending the original:", resizeError);
      }

      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await apiFetch(`${API_BASE_URL}/ocr/meter-photo`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "OCR processing failed.", "error");
        return;
      }

      const detectedReading =
        data.corrected_reading_value ||
        data.reading_value ||
        data.raw_reading_value ||
        "";

      const detectedAccuracy = Number(data.ocr_accuracy || 0);
      const shouldReview = Boolean(data.needs_review);

      setRawReadingValue(data.raw_reading_value || "");
      setCorrectedReadingValue(data.corrected_reading_value || "");
      setCorrectionApplied(Boolean(data.correction_applied));
      setNeedsReview(shouldReview);
      setReviewReason(data.review_reason || "");
      setOcrRawText(data.raw_text || "");
      setEnsembleCandidates(
        Array.isArray(data.ensemble_candidates) ? data.ensemble_candidates : []
      );
      setEnsembleDecision(data.ensemble_decision || "");

      setForm((current) => ({
        ...current,
        reading_value: detectedReading,
        ocr_accuracy: detectedAccuracy,
        ocr_reading: data.success ? detectedReading : "",
        // The servable path the backend saved the photo to, so this reading can be
        // traced back to its evidence. Falls back to the local filename only for
        // display when the backend returned nothing.
        image_path: data.image_path || current.image_path || selectedFileName,
        // Approval is not decided here. The server approves every new reading as
        // it is saved; what this page owes the person is a clear warning before
        // they save when OCR was unsure (needs_review) or the number looks wrong
        // for the meter (plausibilityIssues).
        reading_date:
          current.reading_date ||
          toDateTimeLocalValue(new Date().toISOString()),
      }));

      if (!data.success) {
        showToast(
          data.message || "No meter number detected. Try a clearer, closer photo.",
          "error"
        );
        return;
      }

      if (shouldReview) {
        showToast(
          "OCR was not sure about this number. Compare it with the photo before saving.",
          "warning"
        );
      } else {
        showToast("Meter reading detected.", "success");
      }
    } catch (error) {
      if (error.name === "AbortError") {
        // Aborted by the timeout, or by leaving the page (then nobody sees this).
        showToast(
          "OCR took too long. Try again, or enter the reading manually.",
          "error"
        );
        return;
      }

      console.error("OCR request error:", error);
      showToast(
        "Cannot connect to OCR endpoint. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      window.clearTimeout(timeoutId);
      window.clearInterval(tickId);
      ocrAbortRef.current = null;
      setIsRunningOcr(false);
    }
  }

  async function saveReading({ confirmed = false } = {}) {
    const validationError = getReadingFormError(form, previousReadingValue);

    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    // Unusual but possible (a real jump in use, a coincidental serial match), so
    // the person decides, after being told what looks off.
    const warnings = plausibilityIssues.filter((issue) => !issue.blocking);

    if (warnings.length > 0 && !confirmed) {
      setConfirmation({
        type: "saveUnusualReading",
        title: "Save an unusual reading?",
        message: warnings.map((issue) => issue.message).join(" "),
        note: "Compare the number with the meter photo first. Once saved, it counts in reports straight away.",
        confirmText: "Save Anyway",
        variant: "warning",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/readings/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildReadingPayload(form, previousReadingValue)),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save reading.", "error");
        return;
      }

      showToast(
        nextMeter
          ? `Reading saved. Next: ${nextMeter.serial_no || `Meter #${nextMeterId}`}.`
          : "Reading saved.",
        "success"
      );

      // On to the next meter still to read; with none left, stay on this one.
      setForm({
        ...emptyForm,
        reading_date: getDefaultReadingDate(),
        meter_id: nextMeterId ? String(nextMeterId) : form.meter_id,
      });
      setPreviousReadingValue(0);
      setIsFirstReading(false);
      setPreviousReloadKey((key) => key + 1);

      resetSelectedPhoto();
      await refreshData(false);
    } catch (error) {
      console.error("Save reading error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Picking another meter keeps the photo and its reading, in case the photo was
  // taken first and the wrong meter was selected.
  function selectMeter(meterId) {
    setForm((current) => ({ ...current, meter_id: String(meterId) }));
  }

  // Moves on without saving. The photo belonged to the meter being left, so it goes.
  function skipToNextMeter() {
    if (!nextMeterId) {
      return;
    }

    resetSelectedPhoto();
    setForm({
      ...emptyForm,
      reading_date: getDefaultReadingDate(),
      meter_id: String(nextMeterId),
    });
  }

  function scrollToAllReadings() {
    document
      .getElementById("all-readings")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function askDeleteReading(reading) {
    setConfirmation({
      type: "deleteReading",
      reading,
      title: "Delete reading?",
      message: `You are about to delete reading record #${reading.record_id}. This may affect reports, analytics, and consumption trends.`,
      note: "This action cannot be automatically undone.",
      confirmText: "Delete Reading",
      variant: "danger",
    });
  }

  async function confirmDeleteReading() {
    const reading = confirmation?.reading;

    if (!reading) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/readings/${reading.record_id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not delete reading.", "error");
        return;
      }

      showToast(data.message || "Reading deleted successfully.", "success");

      setConfirmation(null);
      await refreshData(false);
    } catch (error) {
      console.error("Delete reading error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function askVerifyReading(reading) {
    setConfirmation({
      type: "verifyReading",
      reading,
      title: "Verify reading?",
      message: `This will mark reading record #${reading.record_id} as manually verified.`,
      note:
        "Verified readings can be used more confidently in reports and analytics.",
      confirmText: "Verify Reading",
      variant: "success",
    });
  }

  function askReviewReading(reading) {
    setConfirmation({
      type: "reviewReading",
      reading,
      title: "Mark for review?",
      message: `This will mark reading record #${reading.record_id} as needing manual review.`,
      note:
        "Use this when OCR confidence is low or the meter image needs checking.",
      confirmText: "Mark Review",
      variant: "danger",
    });
  }

  async function updateReadingVerification(recordId, shouldVerify) {
    setIsUpdatingStatus(true);

    try {
      const endpoint = shouldVerify ? "verify" : "review";

      const response = await apiFetch(
        `${API_BASE_URL}/readings/${recordId}/${endpoint}`,
        {
          method: "PUT",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not update reading status.", "error");
        return;
      }

      showToast(
        shouldVerify
          ? "Reading marked as verified."
          : "Reading marked for review.",
        "success"
      );

      setConfirmation(null);
      await refreshData(false);
    } catch (error) {
      console.error("Update verification error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  function handleConfirmAction() {
    if (confirmation?.type === "saveUnusualReading") {
      setConfirmation(null);
      saveReading({ confirmed: true });
      return;
    }

    if (confirmation?.type === "deleteReading") {
      confirmDeleteReading();
      return;
    }

    if (confirmation?.type === "verifyReading") {
      updateReadingVerification(confirmation.reading.record_id, true);
      return;
    }

    if (confirmation?.type === "reviewReading") {
      updateReadingVerification(confirmation.reading.record_id, false);
    }
  }

  const confirmationProcessing =
    confirmation?.type === "deleteReading" ? isDeleting : isUpdatingStatus;

  const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  return (
    <div className="space-y-6">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <PageHeader
        eyebrow="Smart Meter Scanner"
        title="Meter Reading OCR"
        subtitle="Capture this period's readings meter by meter."
        icon={ScanLine}
        status={isLoadingData ? "Syncing data" : null}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoadingData}
        intervalMs={AUTO_REFRESH_MS}
        actions={
          <label className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-600">
            Reading period
            <select
              value={period.key}
              onChange={(event) => setPeriodKey(event.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-600"
            >
              {months.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {meters.length === 0 && !isLoadingData && (
        <EmptyState
          variant="blocked"
          icon={AlertTriangle}
          title="No meters available"
          description="Every consumption record must be connected to a meter. Add or load meters first before saving readings."
        />
      )}

      <section
        aria-label="Summary"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-4"
      >
        <SummaryCell
          label={isCurrentPeriod ? "Read this period" : `Read in ${period.label}`}
          value={
            <>
              {rounds.done.length}{" "}
              <span className="text-sm font-medium text-slate-500">
                of {meters.length} meters
              </span>
            </>
          }
        >
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-700 transition-all duration-500"
              style={{ width: `${meterReadPercent}%` }}
            />
          </div>
        </SummaryCell>
        <SummaryCell
          label="Readings saved"
          value={periodReadings.length}
          caption={isCurrentPeriod ? "This period" : period.label}
        />
        <SummaryCell
          label="Used this period"
          value={
            <>
              {formatNumber(periodKwh)}{" "}
              <span className="text-sm font-medium text-slate-500">kWh</span>
            </>
          }
          caption="Measured from meter readings"
        />
        <SummaryCell
          label="Total readings"
          value={totalReadings}
          caption="All meters, all periods"
        />
      </section>

      {/* The round's meters on the left, the selected meter's reading on the
          right. Below lg the list becomes a dropdown at the top of the form. */}
      <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <MeterRoundsList
          className="hidden w-[300px] shrink-0 border-r border-slate-200 bg-slate-50/60 lg:flex"
          toRead={rounds.toRead}
          done={rounds.done}
          selectedMeterId={form.meter_id}
          onSelect={selectMeter}
          getBuildingName={getBuildingName}
          isCurrentPeriod={isCurrentPeriod}
        />

        <section aria-label="Selected meter" className="@container flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-200 px-5 py-4 lg:hidden">
            <Field label="Meter">
              <select
                value={form.meter_id}
                onChange={(event) => selectMeter(event.target.value)}
                className={INPUT_CLASS}
              >
                {meters.length === 0 && <option value="">No meters yet</option>}
                {rounds.toRead.length > 0 && (
                  <optgroup label="To read">
                    {rounds.toRead.map((entry) => (
                      <option key={entry.meter.meter_id} value={entry.meter.meter_id}>
                        {entry.meter.serial_no} • {getBuildingName(entry.meter.building_id)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {rounds.done.length > 0 && (
                  <optgroup label="Done this period">
                    {rounds.done.map((entry) => (
                      <option key={entry.meter.meter_id} value={entry.meter.meter_id}>
                        {entry.meter.serial_no} • {getBuildingName(entry.meter.building_id)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900">
                  {selectedMeter?.serial_no || "No meter selected"}
                </h2>
                {selectedMeter && (
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {selectedMeter.meter_type}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] font-normal text-slate-500">
                {selectedMeter
                  ? getBuildingName(selectedMeter.building_id)
                  : "Pick a meter to read."}
              </p>
            </div>

            {selectedMeter && (
              <dl className="flex flex-wrap gap-x-7 gap-y-2">
                <div>
                  <dt className="text-xs font-normal text-slate-500">Last reading</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                    {latestMeterReading
                      ? `${Number(latestMeterReading.reading_value).toLocaleString()} kWh`
                      : "None yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-normal text-slate-500">Read on</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                    {latestMeterReading ? formatShortDate(latestMeterReading.reading_date) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-normal text-slate-500">Status</dt>
                  <dd className={`mt-0.5 text-sm font-semibold ${selectedStatus.tone}`}>
                    {selectedStatus.text}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="grid gap-6 p-5 sm:p-6 @2xl:grid-cols-2">
            <figure className="flex min-w-0 flex-col gap-2.5">
              <div
                className={`relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl @2xl:min-h-[360px] ${
                  previewUrl
                    ? "bg-slate-900"
                    : "border border-dashed border-slate-300 bg-slate-50"
                }`}
              >
                {previewUrl ? (
                  // Absolutely placed so the photo fills the height the form gives
                  // it instead of setting it.
                  <img
                    key={previewUrl}
                    src={previewUrl}
                    alt="Selected meter"
                    className="animate-image-in absolute inset-0 h-full w-full object-contain p-2"
                  />
                ) : (
                  <label
                    className={`animate-fade-in flex h-full w-full cursor-pointer flex-col items-center justify-center p-8 text-center transition hover:bg-slate-100 ${
                      isRunningOcr ? "pointer-events-none" : ""
                    }`}
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-400 shadow-sm">
                      <FileImage size={24} />
                    </span>
                    <span className="mt-3 text-sm font-semibold text-slate-700">
                      Add a photo of the meter display
                    </span>
                    <span className="mt-1 text-xs font-normal text-slate-500">
                      Click to choose one. The scan starts as soon as you do.
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isRunningOcr}
                      onChange={handleFileChange}
                    />
                  </label>
                )}

                {isRunningOcr && previewUrl && (
                  <div className="pointer-events-none absolute inset-0 z-10 animate-fade-in overflow-hidden bg-emerald-950/10 backdrop-blur-[1px]">
                    <div className="animate-scan-line absolute left-0 h-1 w-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_18px_4px_rgba(16,185,129,0.7)]" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-emerald-950/70 to-transparent p-4">
                      <Loader2 size={16} className="animate-spin text-lime-300" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white">
                        Scanning meter... {ocrElapsedSeconds}s
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <figcaption className="flex items-center justify-between gap-3 text-xs font-normal text-slate-500">
                <span className="min-w-0 truncate" title={selectedFileName || undefined}>
                  {selectedFileName || "No photo yet"}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 font-medium transition-colors duration-300 ${ocrStatusStyle}`}
                >
                  {ocrStatusLabel}
                </span>
              </figcaption>

              {/* Phones get a 2 x 2 grid (with Take photo); elsewhere two wide
                  buttons and an icon-only Remove. */}
              <div
                className={`grid gap-2 ${
                  isMobileDevice ? "grid-cols-2" : "grid-cols-[1fr_1fr_auto]"
                }`}
              >
                <label className={`${SECONDARY_BUTTON_CLASS} cursor-pointer ${isRunningOcr ? "pointer-events-none opacity-60" : ""}`}>
                  <ImagePlus size={16} />
                  {selectedPhotoFile ? "Replace photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isRunningOcr}
                    onChange={handleFileChange}
                  />
                </label>

                {isMobileDevice && (
                  <label className={`${SECONDARY_BUTTON_CLASS} cursor-pointer ${isRunningOcr ? "pointer-events-none opacity-60" : ""}`}>
                    <Camera size={16} />
                    Take photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={isRunningOcr}
                      onChange={handleFileChange}
                    />
                  </label>
                )}

                <button
                  type="button"
                  // Not onClick={runEasyOcr}: React would pass the click event in
                  // as an argument.
                  onClick={() => runEasyOcr()}
                  disabled={isRunningOcr || !selectedPhotoFile}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {isRunningOcr ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ScanLine size={16} />
                  )}
                  {isRunningOcr ? "Scanning..." : "Rescan"}
                </button>

                <button
                  type="button"
                  onClick={resetSelectedPhoto}
                  disabled={isRunningOcr || !selectedPhotoFile}
                  aria-label="Remove photo"
                  title="Remove photo"
                  className={`${SECONDARY_BUTTON_CLASS} ${isMobileDevice ? "" : "w-11"}`}
                >
                  <Trash2 size={16} className="shrink-0" />
                  {isMobileDevice && "Remove"}
                </button>
              </div>
            </figure>

            <div className="flex min-w-0 flex-col gap-4">
              {correctionApplied && (
                <p className="animate-fade-up rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-[13px] font-normal text-blue-800">
                  <span className="font-semibold">Reading adjusted:</span> read as{" "}
                  {rawReadingValue || "—"}, corrected to {correctedReadingValue}.
                </p>
              )}

              {/* Why the reading was flagged. The backend has always sent this and
                  it was never shown, so a user saw "needs review" with no reason. */}
              {needsReview && reviewReason && (
                <div
                  role="status"
                  className="animate-fade-up grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"
                >
                  <AlertTriangle size={18} className="mt-px text-amber-700" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-amber-900">Check the number</p>
                    <p className="mt-0.5 text-[13px] font-normal leading-5 text-amber-800">
                      {reviewReason}
                    </p>
                    {otherReadings.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {otherReadings.map((option) => (
                          <button
                            key={option.digits}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                reading_value: option.digits,
                              }))
                            }
                            className="text-left text-[13px] font-semibold text-amber-900 transition hover:text-amber-950"
                          >
                            <span className="underline underline-offset-2">
                              Use {option.digits} instead
                            </span>{" "}
                            <span className="font-normal text-amber-800">
                              ({option.labels.join(", ")})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {plausibilityIssues.length > 0 && (
                <div
                  role="status"
                  className="animate-fade-up grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"
                >
                  <AlertTriangle size={18} className="mt-px text-amber-700" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-amber-900">Check this reading</p>
                    <ul className="mt-0.5 space-y-1 text-[13px] font-normal leading-5 text-amber-800">
                      {plausibilityIssues.map((issue) => (
                        <li key={issue.code}>{issue.message}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {isFirstReading && (
                <Field
                  label="Previous reading (required)"
                  helper="This meter has no saved readings yet. Enter the value it started from."
                >
                  <input
                    type="number"
                    step="any"
                    value={isFetchingPrevious ? "" : previousReadingValue}
                    onChange={(event) => setPreviousReadingValue(Number(event.target.value))}
                    placeholder={isFetchingPrevious ? "Fetching..." : "0"}
                    className={INPUT_CLASS}
                  />
                </Field>
              )}

              <Field label="Present reading" helper={presentReadingHelper}>
                <span
                  className={`flex overflow-hidden rounded-xl border bg-white transition focus-within:border-emerald-600 ${
                    plausibilityIssues.length > 0 ? "border-amber-300" : "border-slate-300"
                  }`}
                >
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={form.reading_value}
                    onChange={(event) =>
                      setForm({ ...form, reading_value: event.target.value })
                    }
                    placeholder="—"
                    aria-invalid={plausibilityIssues.length > 0}
                    className="min-h-[52px] min-w-0 flex-1 bg-transparent px-3.5 text-2xl font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-300"
                  />
                  <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3.5 text-[13px] font-semibold text-slate-600">
                    kWh
                  </span>
                </span>
              </Field>

              <Field label="Reading date and time">
                <input
                  type="datetime-local"
                  value={form.reading_date}
                  onChange={(event) => {
                    const val = event.target.value;
                    setForm((prev) => ({ ...prev, reading_date: val }));
                  }}
                  className={INPUT_CLASS}
                />
              </Field>

              <dl className="overflow-hidden rounded-xl border border-slate-200 text-[13px] tabular-nums">
                <CalcRow
                  label="Previous reading"
                  value={
                    isFetchingPrevious
                      ? "..."
                      : `${Number(previousReadingValue).toLocaleString()} kWh`
                  }
                />
                <CalcRow
                  label="Present reading"
                  value={
                    form.reading_value
                      ? `${Number(form.reading_value).toLocaleString()} kWh`
                      : "—"
                  }
                />
                {periodDays !== null && (
                  <CalcRow
                    label="Period"
                    value={`${formatDays(periodDays)} · ${(
                      consumptionKwh / Math.max(periodDays, 1)
                    ).toFixed(1)} kWh/day`}
                  />
                )}
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3.5 py-3">
                  <dt className="font-semibold text-slate-900">Consumption</dt>
                  <dd
                    className={`text-lg font-bold ${
                      consumptionKwh === null ? "text-slate-300" : "text-emerald-700"
                    }`}
                  >
                    {consumptionKwh === null ? "—" : `${consumptionKwh.toLocaleString()} kWh`}
                  </dd>
                </div>
              </dl>

              {/* The ensemble's working. This is the part of the system worth
                  showing: four engines read the photo independently and the answer
                  is reconciled between them. It was computed and then discarded. */}
              {ensembleCandidates.length > 0 && (
                <details className="animate-fade-up rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                  <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">
                    How the engines read it ({ensembleCandidates.length})
                  </summary>

                  <div className="mt-3 space-y-1.5">
                    {ensembleCandidates.map((voter) => (
                      <div
                        key={voter.source}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${
                          voter.chosen
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <span className="min-w-0 truncate font-medium text-slate-600">
                          {voter.label || voter.source}
                        </span>

                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {voter.digits || "—"}
                          </span>
                          <span className="text-slate-500">
                            {Math.round((voter.instance_confidence || 0) * 100)}%
                          </span>
                          {voter.chosen && (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                              used
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {ensembleDecision && (
                    <p className="mt-3 text-xs font-normal leading-5 text-slate-500">
                      Decision: {ensembleDecision}
                    </p>
                  )}

                  {ocrRawText && (
                    <p className="mt-2 break-words text-[11px] font-normal leading-5 text-slate-500">
                      Raw: {ocrRawText}
                    </p>
                  )}
                </details>
              )}
            </div>
          </div>

          {/* Readings are approved by the server as they are saved, so there is
              no review step here; the amber notes above are the check. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:px-6">
            <p className="flex items-center gap-1.5 text-xs font-normal text-slate-500">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
              Readings are approved as soon as you save them.
            </p>

            <div className="flex flex-wrap gap-2.5">
              {nextMeterId && (
                <button
                  type="button"
                  onClick={skipToNextMeter}
                  disabled={isRunningOcr || isSaving}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Skip meter
                </button>
              )}

              <button
                type="button"
                onClick={() => saveReading()}
                disabled={isSaving || meters.length === 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {isSaving ? "Saving..." : nextMeterId ? "Save and next meter" : "Save reading"}
                {!isSaving && nextMeterId && <ArrowRight size={16} />}
              </button>
            </div>
          </div>

          {selectedMeter && (
            <MeterReadingHistory
              rows={meterHistory}
              draft={draftHistoryRow}
              onViewAll={scrollToAllReadings}
            />
          )}
        </section>
      </div>

      <section
        id="all-readings"
        className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Latest Readings
            </h2>
            <p className="mt-1 text-sm font-normal text-slate-500">
              Review saved OCR and manual readings.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px] xl:w-[620px]">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={18} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search readings, meters, buildings..."
                className="w-full bg-transparent text-sm font-normal text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Status">All Status</option>
              <option value="Verified">Verified</option>
              <option value="Needs Review">Needs Review</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[1120px]">
            <div className="grid grid-cols-[90px_1.2fr_1.1fr_1fr_130px_180px] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Meter / Building</div>
              <div>Reading</div>
              <div>Date</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {isLoadingData ? (
              <SkeletonRows columns={READING_ROW_COLUMNS} rows={5} />
            ) : filteredReadings.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  variant="filtered"
                  icon={Search}
                  title="No readings match your filters"
                  description="Try a different search term, or reset the filters to see every saved reading."
                  action={
                    <HeaderActionButton icon={X} onClick={clearFilters}>
                      Clear filters
                    </HeaderActionButton>
                  }
                  className="m-4"
                />
              ) : (
                <EmptyState
                  icon={ScanLine}
                  title="No readings yet"
                  description="Upload a meter photo above to capture a reading, or enter one manually."
                  className="m-4"
                />
              )
            ) : (
              <div className="divide-y divide-slate-100">
                {paginatedReadings.map((reading) => {
                  const meter = getMeter(reading.meter_id);
                  const buildingName = meter
                    ? getBuildingName(meter.building_id)
                    : "Unknown building";

                  return (
                    <div
                      key={reading.record_id}
                      className="grid grid-cols-[90px_1.2fr_1.1fr_1fr_130px_180px] items-center px-4 py-4 text-sm"
                    >
                      <div className="font-semibold text-slate-700">
                        #{reading.record_id}
                      </div>

                      <div>
                        <p className="font-semibold text-slate-950">
                          {meter?.serial_no || `Meter #${reading.meter_id}`}
                        </p>
                        <p className="mt-1 text-xs font-normal text-slate-400">
                          {buildingName}
                        </p>
                      </div>

                      <div className="font-semibold text-slate-950">
                        {formatNumber(reading.reading_value)} kWh
                      </div>

                      <div className="font-medium text-slate-600">
                        {formatDateTime(reading.reading_date)}
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusStyle(
                            reading.is_verified
                          )}`}
                        >
                          {reading.is_verified ? "Verified" : "Review"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailsReading(reading)}
                          className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
                          title="View reading"
                        >
                          <Eye size={16} />
                        </button>

                        {reading.is_verified ? (
                          <button
                            type="button"
                            onClick={() => askReviewReading(reading)}
                            className="rounded-xl bg-amber-50 p-2 text-amber-700 transition hover:bg-amber-100"
                            title="Mark for review"
                          >
                            <AlertTriangle size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => askVerifyReading(reading)}
                            className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                            title="Verify reading"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => askDeleteReading(reading)}
                          className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                          title="Delete reading"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs font-normal text-slate-400">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filteredReadings.length)} of{" "}
              {filteredReadings.length} readings
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-medium text-white">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      <ReadingDetailsModal
        reading={detailsReading}
        meters={meters}
        buildings={buildings}
        onClose={() => setDetailsReading(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(confirmation)}
        title={confirmation?.title}
        message={confirmation?.message}
        note={confirmation?.note}
        confirmText={confirmation?.confirmText}
        variant={confirmation?.variant}
        isProcessing={confirmationProcessing}
        onCancel={() => setConfirmation(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
};

// Returns an error message, or null when the form is safe to save.
//
// This was previously `return true`, so nothing was ever checked: an empty form
// saved a reading of 0 (because Number("") is 0), and a backwards reading was
// accepted and then silently clamped to zero consumption by reading_differential
// on the backend, corrupting the next reading's difference as well.
//
// The backend enforces the same rules in apply_reading_rules; this copy exists to
// give immediate feedback, not to be the only gate.
function getReadingFormError(form, previousReading) {
  if (!form.meter_id) {
    return "Please select the meter this reading belongs to.";
  }

  const rawValue = String(form.reading_value ?? "").trim();

  if (!rawValue) {
    return "Please enter the meter reading.";
  }

  const readingValue = Number(rawValue);

  if (!Number.isFinite(readingValue)) {
    return "The meter reading must be a number.";
  }

  if (readingValue < 0) {
    return "The meter reading cannot be negative.";
  }

  // A meter face only counts up, so anything below the previous value is a typo or
  // a misread photo. previousReading is the meter's initial reading when no prior
  // record exists, which is the right floor for a first reading too.
  const previous = Number(previousReading) || 0;

  if (readingValue < previous) {
    return (
      `This reading (${readingValue.toLocaleString()}) is lower than the previous ` +
      `reading (${previous.toLocaleString()}). A meter only counts up, so please ` +
      `re-check the photo or correct the value before saving.`
    );
  }

  if (form.reading_date) {
    const readingDate = new Date(form.reading_date);

    if (Number.isNaN(readingDate.getTime())) {
      return "Please enter a valid reading date.";
    }

    // A minute of slack so a device clock running slightly fast doesn't block a save.
    if (readingDate.getTime() > Date.now() + 60000) {
      return "The reading date cannot be in the future.";
    }
  }

  return null;
}

function buildReadingPayload(form, previousReading = 0) {
  return {
    meter_id: Number(form.meter_id),
    previous_reading: Number(previousReading),
    reading_value: Number(form.reading_value),
    reading_date: form.reading_date
      ? new Date(form.reading_date).toISOString()
      : new Date().toISOString(),
    // Empty rather than a placeholder string, so "has a photo" is a real test.
    image_path: form.image_path || "",
    // null rather than 0 when nothing was scored. A typed-in reading has no OCR
    // accuracy, and a stored 0 was read back as "0% accurate" by every page.
    ocr_accuracy: getOcrScore(form.ocr_accuracy),
    // What OCR read, next to the value the person saved. Where the two differ the
    // photo records a misread, which is what the trained models need to learn from.
    ocr_reading: /^[0-9]+$/.test(form.ocr_reading || "") ? form.ocr_reading : null,
    // user_id and is_verified are deliberately not sent. The backend takes the
    // author from the token and approves every new reading itself.
  };
}

export default UploadOCR;