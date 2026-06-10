import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Eye,
  FileImage,
  Gauge,
  ImagePlus,
  Info,
  Loader2,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import HeaderActionButton from "../components/HeaderActionButton";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import ToastMessage from "../components/ToastMessage";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
const AUTO_REFRESH_MS = 30000;
const PAGE_SIZE = 20;

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
  is_verified: false,
};

function getSavedUser() {
  const savedUser = localStorage.getItem("user");

  if (!savedUser) {
    return null;
  }

  try {
    return JSON.parse(savedUser);
  } catch {
    return null;
  }
}

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
    ocr_accuracy: reading.ocr_accuracy ?? 0,
    is_verified: Boolean(reading.is_verified),
  };
}

function formatNumber(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return value || "0";
  }

  return numericValue.toLocaleString();
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
      return "Detected but needs review";
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

function Field({ label, children, helper }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>

      {children}

      {helper && (
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </label>
  );
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
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
              Reading Record
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Reading #{reading.record_id}
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
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
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Present Reading
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950">
              {formatNumber(reading.reading_value)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Previous Reading
            </p>
            <p className="mt-2 text-2xl font-black text-slate-600">
              {formatNumber(reading.previous_reading ?? 0)} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              kWh Consumed
            </p>
            <p className="mt-2 text-2xl font-black text-emerald-900">
              {formatNumber(Math.max(reading.reading_value - (reading.previous_reading ?? 0), 0))} kWh
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Meter
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {meter?.serial_no || `Meter #${reading.meter_id}`}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Building
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {building?.name || "Unknown building"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Reading Date
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {formatDateTime(reading.reading_date)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Image Path
            </p>
            <p className="mt-2 break-words text-sm font-bold text-slate-700">
              {reading.image_path}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Verification Status
            </p>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
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
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const UploadOCR = () => {
  const savedUser = getSavedUser();

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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [ocrEngine, setOcrEngine] = useState("gemini_vision");
  const [rawReadingValue, setRawReadingValue] = useState("");
  const [correctedReadingValue, setCorrectedReadingValue] = useState("");
  const [correctionApplied, setCorrectionApplied] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [ocrRawText, setOcrRawText] = useState("");
  const [ocrCandidates, setOcrCandidates] = useState([]);
  const [previousReadingValue, setPreviousReadingValue] = useState(0);
  const [isFirstReading, setIsFirstReading] = useState(false);
  const [isFetchingPrevious, setIsFetchingPrevious] = useState(false);

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

  function getMeterLabel(meterId) {
    const meter = getMeter(meterId);

    if (!meter) {
      return "Unknown meter";
    }

    return `${meter.serial_no} • ${getBuildingName(meter.building_id)}`;
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

      setForm((current) => {
        if (current.meter_id || meterData.length === 0) {
          return current;
        }

        return {
          ...current,
          meter_id: String(meterData[0].meter_id),
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
        String(reading.ocr_accuracy).includes(searchValue) ||
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

  const totalPages = Math.max(1, Math.ceil(filteredReadings.length / PAGE_SIZE));

  const paginatedReadings = useMemo(
    () => filteredReadings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredReadings, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter]);

  useEffect(() => {
    if (!form.meter_id) {
      setPreviousReadingValue(0);
      setIsFirstReading(false);
      return undefined;
    }

    let cancelled = false;
    setIsFetchingPrevious(true);

    apiFetch(`${API_BASE_URL}/readings/meter/${form.meter_id}/last`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setPreviousReadingValue(Number(data.reading_value ?? 0));
          setIsFirstReading(!data.has_prior);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviousReadingValue(0);
          setIsFirstReading(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsFetchingPrevious(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.meter_id]);

  const totalReadings = readings.length;
  const verifiedReadings = readings.filter((reading) => reading.is_verified).length;
  const pendingReadings = readings.filter((reading) => !reading.is_verified).length;
  const selectedMeter = getMeter(form.meter_id);
  const selectedBuilding = selectedMeter
    ? buildings.find(
        (building) =>
          Number(building.building_id) === Number(selectedMeter.building_id)
      )
    : null;

  const ocrStatusLabel = getOcrStatusLabel({
    selectedPhotoFile,
    isRunningOcr,
    readingValue: form.reading_value,
    needsReview,
  });

  const ocrStatusStyle = getOcrStatusStyle({
    selectedPhotoFile,
    isRunningOcr,
    readingValue: form.reading_value,
    needsReview,
  });

  function clearOcrResult() {
    setOcrEngine("gemini_vision");
    setRawReadingValue("");
    setCorrectedReadingValue("");
    setCorrectionApplied(false);
    setNeedsReview(false);
    setReviewReason("");
    setOcrRawText("");
    setOcrCandidates([]);
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
      is_verified: false,
    }));

    event.target.value = "";

    // Auto-run OCR as soon as a photo is selected.
    if (form.meter_id) {
      runEasyOcr(file);
    } else {
      showToast("Select a meter, then OCR will run automatically.", "error");
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

    setIsRunningOcr(true);
    clearOcrResult();

    try {
      const formData = new FormData();
      formData.append("file", photoFile);

      const response = await apiFetch(`${API_BASE_URL}/ocr/meter-photo`, {
        method: "POST",
        body: formData,
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

      setOcrEngine(data.ocr_engine || "gemini_vision");
      setRawReadingValue(data.raw_reading_value || "");
      setCorrectedReadingValue(data.corrected_reading_value || "");
      setCorrectionApplied(Boolean(data.correction_applied));
      setNeedsReview(shouldReview);
      setReviewReason(data.review_reason || "");
      setOcrRawText(data.raw_text || "");
      setOcrCandidates(
        Array.isArray(data.all_candidates) ? data.all_candidates : []
      );

      setForm((current) => ({
        ...current,
        reading_value: detectedReading,
        ocr_accuracy: detectedAccuracy,
        image_path: data.image_path || current.image_path || selectedFileName,
        is_verified: !shouldReview && detectedAccuracy >= 97,
        reading_date:
          current.reading_date ||
          toDateTimeLocalValue(new Date().toISOString()),
      }));

      if (!data.success) {
        showToast(
          data.message || "No meter number detected. Try a clearer crop.",
          "error"
        );
        return;
      }

      if (shouldReview) {
        showToast(
          "OCR detected a reading, but manual review is required.",
          "error"
        );
      } else {
        showToast(
          "Meter reading detected successfully. Please review before saving.",
          "success"
        );
      }
    } catch (error) {
      console.error("OCR request error:", error);
      showToast(
        "Cannot connect to OCR endpoint. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsRunningOcr(false);
    }
  }

  async function saveReading() {
    if (!validateForm()) {
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

      showToast("Meter reading saved successfully.", "success");

      setForm({
        ...emptyForm,
        reading_date: getDefaultReadingDate(),
        meter_id: meters[0]?.meter_id ? String(meters[0].meter_id) : "",
      });
      setPreviousReadingValue(0);
      setIsFirstReading(false);

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
    <div className="space-y-6 font-[Nunito]">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <PageHeader
        eyebrow="Smart Meter Scanner"
        title="Meter Reading OCR"
        subtitle="Upload, verify, and save meter readings."
        icon={ScanLine}
        status={isLoadingData ? "Syncing data" : `${totalReadings} Readings`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoadingData}
        intervalMs={AUTO_REFRESH_MS}
        actions={null}
      />

      {/* ── Mobile Camera Section (mobile only) ── */}
      {isMobileDevice && (
        <section className="rounded-[1.7rem] border border-emerald-100 bg-gradient-to-br from-emerald-700 to-emerald-800 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Capture Meter</h2>
              <p className="text-xs font-bold text-emerald-100">
                Take a photo of the meter display directly.
              </p>
            </div>
          </div>

          <label className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-white py-4 text-sm font-black text-emerald-700 shadow-sm active:scale-[0.98] transition-transform duration-150">
            <Camera size={22} />
            Open Camera
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {selectedPhotoFile && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5">
              <CheckCircle2 size={16} className="text-lime-300" />
              <p className="text-xs font-black text-white">
                Photo selected — scroll down to run OCR.
              </p>
            </div>
          )}
        </section>
      )}

      {meters.length === 0 && (
        <section className="rounded-[1.7rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white">
              <AlertTriangle size={22} />
            </div>

            <div>
              <h2 className="text-lg font-black text-amber-900">
                No meters available
              </h2>
              <p className="mt-1 text-sm font-bold leading-6 text-amber-700">
                Add or load meters first before saving readings, because every
                consumption record must be connected to a meter.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-500">Total Readings</p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {totalReadings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Gauge size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-400">
            Stored consumption records
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-emerald-700">Verified</p>
              <p className="mt-2 text-3xl font-black text-emerald-800">
                {verifiedReadings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
              <CheckCircle2 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-emerald-700">
            Ready for reports
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-amber-700">Needs Review</p>
              <p className="mt-2 text-3xl font-black text-amber-800">
                {pendingReadings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-white">
              <AlertTriangle size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-amber-700">
            Pending manual check
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Meter Photo Capture
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Upload a meter photo and run OCR to detect the reading.
              </p>
            </div>

            <div className={`rounded-full border px-3 py-1 text-xs font-black transition-colors duration-300 ${ocrStatusStyle}`}>
              {ocrStatusLabel}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-[1.2rem] border border-dashed border-slate-300 bg-white">
                {previewUrl ? (
                  <img
                    key={previewUrl}
                    src={previewUrl}
                    alt="Selected meter"
                    className="animate-image-in max-h-[360px] w-full object-contain"
                  />
                ) : (
                  <div className="animate-fade-in p-8 text-center">
                    <FileImage className="mx-auto text-slate-300" size={58} />
                    <p className="mt-4 text-sm font-black text-slate-500">
                      No meter photo selected
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      Upload or capture a clear meter image.
                    </p>
                  </div>
                )}

                {/* Scanning overlay while OCR runs */}
                {isRunningOcr && previewUrl && (
                  <div className="pointer-events-none absolute inset-0 z-10 animate-fade-in overflow-hidden bg-emerald-950/10 backdrop-blur-[1px]">
                    <div className="animate-scan-line absolute left-0 h-1 w-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_18px_4px_rgba(16,185,129,0.7)]" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-emerald-950/70 to-transparent p-4">
                      <Loader2 size={16} className="animate-spin text-lime-300" />
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-white">
                        Scanning meter...
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className={`mt-4 grid gap-3 ${isMobileDevice ? "sm:grid-cols-2" : ""}`}>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                  <ImagePlus size={18} />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                {isMobileDevice && (
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                    <Camera size={18} />
                    Take Photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={runEasyOcr}
                  disabled={isRunningOcr || !selectedPhotoFile}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunningOcr ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ScanLine size={18} />
                  )}
                  {isRunningOcr ? "Reading..." : "Run OCR"}
                </button>

                <button
                  type="button"
                  onClick={resetSelectedPhoto}
                  disabled={!selectedPhotoFile}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw size={18} />
                  Reset
                </button>
              </div>

              {selectedFileName && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Selected File
                  </p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-700">
                    {selectedFileName}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Field label="Assigned Meter">
                <select
                  value={form.meter_id}
                  onChange={(event) =>
                    setForm({ ...form, meter_id: event.target.value })
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white"
                >
                  <option value="">Select meter</option>
                  {meters.map((meter) => (
                    <option key={meter.meter_id} value={meter.meter_id}>
                      {meter.serial_no} • {getBuildingName(meter.building_id)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={isFirstReading ? "Previous Reading (required)" : "Previous Reading (auto-filled)"}
                helper={isFirstReading
                  ? "No prior record found. Enter the meter's previous reading value."
                  : "Taken from the last recorded reading for this meter."}
              >
                <input
                  type="number"
                  step="any"
                  readOnly={!isFirstReading}
                  value={isFetchingPrevious ? "" : previousReadingValue}
                  onChange={isFirstReading
                    ? (e) => setPreviousReadingValue(Number(e.target.value))
                    : undefined}
                  placeholder={isFetchingPrevious ? "Fetching..." : "0"}
                  className={
                    isFirstReading
                      ? "w-full rounded-2xl border border-slate-300 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
                      : "w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-500 outline-none"
                  }
                />
              </Field>

              {form.reading_value && form.meter_id && (
                <div className="animate-fade-up rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                    Consumption This Period
                  </p>
                  <p className="mt-2 text-2xl font-black text-emerald-900">
                    {Math.max(Number(form.reading_value) - previousReadingValue, 0).toLocaleString()} kWh
                  </p>
                  <p className="mt-1 text-xs font-bold text-emerald-600">
                    Present ({Number(form.reading_value).toLocaleString()}) − Previous ({previousReadingValue.toLocaleString()})
                  </p>
                </div>
              )}

              <Field label="Present Reading">
                <input
                  type="number"
                  step="any"
                  value={form.reading_value}
                  onChange={(event) =>
                    setForm({ ...form, reading_value: event.target.value })
                  }
                  placeholder="Example: 82353"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
                />
              </Field>

              <Field label="Reading Date">
                <input
                  type="datetime-local"
                  value={form.reading_date}
                  onChange={(event) => {
                    const val = event.target.value;
                    setForm((prev) => ({ ...prev, reading_date: val }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white"
                />
              </Field>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_verified}
                  onChange={(event) =>
                    setForm({ ...form, is_verified: event.target.checked })
                  }
                  className="h-5 w-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                Mark as manually verified
              </label>

              <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm font-black text-emerald-800">
                  Selected Meter Context
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-700">
                  {selectedMeter
                    ? `${selectedMeter.serial_no} • ${
                        selectedBuilding?.name || "Unknown building"
                      }`
                    : "No meter selected"}
                </p>
              </div>

              <button
                type="button"
                onClick={saveReading}
                disabled={isSaving || meters.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {isSaving ? "Saving..." : "Save Reading"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-700 text-white">
                <Info size={21} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  OCR Result
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-400">
                  Review before saving.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Detected Reading
                </p>
                <p
                  key={form.reading_value || "empty"}
                  className={`mt-2 text-3xl font-black text-slate-950 ${form.reading_value ? "animate-pop" : ""}`}
                >
                  {form.reading_value || "—"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Scan Status
                </p>
                <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black transition-colors duration-300 ${ocrStatusStyle}`}>
                  {ocrStatusLabel}
                </span>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Previous Reading
                </p>
                <p className="mt-2 text-xl font-black text-slate-700">
                  {isFetchingPrevious ? "—" : previousReadingValue.toLocaleString()} kWh
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {isFirstReading ? "No prior record — initial reading" : "Last recorded reading"}
                </p>
              </div>

              <div className={`rounded-2xl border p-4 ${form.reading_value && form.meter_id ? "border-emerald-100 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}>
                <p className={`text-xs font-black uppercase tracking-[0.16em] ${form.reading_value && form.meter_id ? "text-emerald-700" : "text-slate-400"}`}>
                  Consumption This Period
                </p>
                <p className={`mt-2 text-2xl font-black ${form.reading_value && form.meter_id ? "text-emerald-900" : "text-slate-400"}`}>
                  {form.reading_value && form.meter_id
                    ? `${Math.max(Number(form.reading_value) - previousReadingValue, 0).toLocaleString()} kWh`
                    : "— kWh"}
                </p>
              </div>

              {selectedMeter && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Assigned Meter
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-950">
                    {selectedMeter.serial_no}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {selectedBuilding?.name || "Unknown building"}
                  </p>
                </div>
              )}

              {correctionApplied && (
                <div className="animate-fade-up rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                    Reading Adjusted
                  </p>
                  <p className="mt-2 text-sm font-bold text-blue-800">
                    Corrected to {correctedReadingValue}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              Latest Readings
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
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
                className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Status">All Status</option>
              <option value="Verified">Verified</option>
              <option value="Needs Review">Needs Review</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[1120px]">
            <div className="grid grid-cols-[90px_1.2fr_1.1fr_1fr_130px_180px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Meter / Building</div>
              <div>Reading</div>
              <div>Date</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {isLoadingData ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading readings...
              </div>
            ) : filteredReadings.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                No readings found.
              </div>
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
                      <div className="font-black text-slate-700">
                        #{reading.record_id}
                      </div>

                      <div>
                        <p className="font-black text-slate-950">
                          {meter?.serial_no || `Meter #${reading.meter_id}`}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {buildingName}
                        </p>
                      </div>

                      <div className="font-black text-slate-950">
                        {formatNumber(reading.reading_value)} kWh
                      </div>

                      <div className="font-bold text-slate-600">
                        {formatDateTime(reading.reading_date)}
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
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
            <p className="text-xs font-bold text-slate-400">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filteredReadings.length)} of{" "}
              {filteredReadings.length} readings
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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

function validateForm() {
  return true;
}

function buildReadingPayload(form, previousReading = 0) {
  const savedUser = getSavedUser();

  return {
    meter_id: Number(form.meter_id),
    user_id: Number(savedUser?.user_id || savedUser?.id || 1),
    previous_reading: Number(previousReading),
    reading_value: Number(form.reading_value),
    reading_date: form.reading_date
      ? new Date(form.reading_date).toISOString()
      : new Date().toISOString(),
    image_path: form.image_path || "No image attached",
    ocr_accuracy: Number(form.ocr_accuracy || 0),
    is_verified: Boolean(form.is_verified),
  };
}

export default UploadOCR;