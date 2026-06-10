import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  Eye,
  Gauge,
  History,
  Pencil,
  Plus,
  Search,
  TrendingUp,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import HeaderActionButton from "../components/HeaderActionButton";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import ToastMessage from "../components/ToastMessage";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
const AUTO_REFRESH_MS = 60000;

const emptyForm = {
  serial_no: "",
  building_id: "",
  meter_type: "Digital",
  status: "Active",
  initial_reading: "",
};

const sampleMeters = [
  {
    serial_no: "MTR-ADM-001",
    building_name: "Admin Building",
    meter_type: "Digital",
    status: "Active",
  },
  {
    serial_no: "MTR-ENG-001",
    building_name: "Engineering Building",
    meter_type: "Digital",
    status: "Active",
  },
  {
    serial_no: "MTR-LIB-001",
    building_name: "Library",
    meter_type: "Analog",
    status: "Active",
  },
  {
    serial_no: "MTR-WRH-001",
    building_name: "Warehouse",
    meter_type: "Digital",
    status: "Active",
  },
  {
    serial_no: "MTR-LAB-001",
    building_name: "Laboratory Building",
    meter_type: "Digital",
    status: "Active",
  },
];

const meterTypes = ["Digital", "Analog"];
const statusOptions = ["Active", "Inactive"];

function normalizeMeter(meter) {
  return {
    meter_id: meter.meter_id,
    serial_no: meter.serial_no || "",
    building_id: meter.building_id ?? "",
    meter_type: meter.meter_type || meter.category || "Digital",
    status: meter.status || "Active",
    initial_reading: meter.initial_reading ?? "",
    latest_reading: meter.latest_reading ?? null,
    previous_reading: meter.previous_reading ?? null,
  };
}

function formatReading(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeBuilding(building) {
  return {
    building_id: building.building_id,
    name: building.name || "",
    status: building.status || "Active",
  };
}

function getStatusStyle(status) {
  if (status === "Active") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "Inactive") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
}

function getStatusIcon(status) {
  if (status === "Active") {
    return <CheckCircle2 size={15} />;
  }

  if (status === "Inactive") {
    return <XCircle size={15} />;
  }

  return <Gauge size={15} />;
}

function getTypeStyle(type) {
  if (type === "Digital") {
    return "border-blue-100 bg-blue-50 text-blue-700";
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

function MeterModal({
  modal,
  form,
  setForm,
  buildings,
  onClose,
  onSave,
  isSaving,
}) {
  if (!modal) {
    return null;
  }

  const isView = modal.mode === "view";

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
              Meter Record
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {modal.mode === "add"
                ? "Add Meter"
                : modal.mode === "edit"
                ? "Edit Meter"
                : "Meter Details"}
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Connect meters to buildings and readings.
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

        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Meter Serial Number">
              <input
                disabled={isView}
                value={form.serial_no}
                onChange={(event) =>
                  setForm({ ...form, serial_no: event.target.value })
                }
                placeholder="Example: MTR-ADM-001"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field
              label="Assigned Building"
              helper="Each meter must belong to one building."
            >
              <select
                disabled={isView}
                value={form.building_id}
                onChange={(event) =>
                  setForm({ ...form, building_id: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">Select building</option>
                {buildings.map((building) => (
                  <option
                    key={building.building_id}
                    value={building.building_id}
                  >
                    {building.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Meter Type">
              <select
                disabled={isView}
                value={form.meter_type}
                onChange={(event) =>
                  setForm({ ...form, meter_type: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {meterTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Operational Status">
              <select
                disabled={isView}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Previous Meter Reading (kWh)"
              helper={
                modal.mode === "add"
                  ? "Enter the base/starting reading of this meter."
                  : "This value was set when the meter was added and cannot be changed."
              }
            >
              <input
                type="number"
                min="0"
                step="any"
                disabled={modal.mode !== "add"}
                value={form.initial_reading}
                onChange={(event) =>
                  setForm({ ...form, initial_reading: event.target.value })
                }
                placeholder="e.g. 12345.00"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </Field>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white p-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            {isView ? "Close" : "Cancel"}
          </button>

          {!isView && (
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Meter"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const MetersPage = () => {
  const [meters, setMeters] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [buildingFilter, setBuildingFilter] = useState("All Buildings");
  const [modal, setModal] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isLoadingMeters, setIsLoadingMeters] = useState(false);
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRemovingSamples, setIsRemovingSamples] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  function getBuildingName(buildingId) {
    const building = buildings.find(
      (item) => Number(item.building_id) === Number(buildingId)
    );

    return building?.name || "Unassigned building";
  }

  async function fetchBuildings() {
    setIsLoadingBuildings(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/buildings/`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load buildings.");
      }

      setBuildings(Array.isArray(data) ? data.map(normalizeBuilding) : []);
    } catch (error) {
      console.error("Fetch buildings error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoadingBuildings(false);
    }
  }

  async function fetchMeters() {
    setIsLoadingMeters(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/meters/`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load meters.");
      }

      setMeters(Array.isArray(data) ? data.map(normalizeMeter) : []);
    } catch (error) {
      console.error("Fetch meters error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoadingMeters(false);
    }
  }

  async function refreshData(showSuccessToast = false) {
    await Promise.all([fetchBuildings(), fetchMeters()]);

    if (showSuccessToast) {
      showToast("Meter data refreshed successfully.", "success");
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(
    () => refreshData(false),
    {
      intervalMs: AUTO_REFRESH_MS,
      enabled: !modal && !confirmation,
    }
  );

  const filteredMeters = useMemo(() => {
    return meters.filter((meter) => {
      const searchValue = query.toLowerCase();
      const buildingName = getBuildingName(meter.building_id).toLowerCase();

      const matchesSearch =
        meter.serial_no.toLowerCase().includes(searchValue) ||
        meter.meter_type.toLowerCase().includes(searchValue) ||
        meter.status.toLowerCase().includes(searchValue) ||
        buildingName.includes(searchValue);

      const matchesType =
        typeFilter === "All Types" || meter.meter_type === typeFilter;

      const matchesStatus =
        statusFilter === "All Status" || meter.status === statusFilter;

      const matchesBuilding =
        buildingFilter === "All Buildings" ||
        Number(meter.building_id) === Number(buildingFilter);

      return matchesSearch && matchesType && matchesStatus && matchesBuilding;
    });
  }, [meters, query, typeFilter, statusFilter, buildingFilter, buildings]);

  const totalMeters = meters.length;
  const activeMeters = meters.filter((meter) => meter.status === "Active").length;
  const inactiveMeters = meters.filter(
    (meter) => meter.status === "Inactive"
  ).length;
  const assignedBuildings = new Set(meters.map((meter) => meter.building_id))
    .size;

  function openAddModal() {
    setForm({
      ...emptyForm,
      building_id: buildings[0]?.building_id
        ? String(buildings[0].building_id)
        : "",
    });
    setModal({ mode: "add" });
  }

  function openViewModal(meter) {
    setForm({
      ...normalizeMeter(meter),
      building_id: String(meter.building_id),
    });
    setModal({ mode: "view", meterId: meter.meter_id });
  }

  function openEditModal(meter) {
    setForm({
      ...normalizeMeter(meter),
      building_id: String(meter.building_id),
    });
    setModal({ mode: "edit", meterId: meter.meter_id });
  }

  function validateForm() {
    if (!form.serial_no.trim()) {
      showToast("Please enter the meter serial number.", "error");
      return false;
    }

    if (!form.building_id) {
      showToast("Please select the assigned building.", "error");
      return false;
    }

    if (!form.meter_type.trim()) {
      showToast("Please select the meter type.", "error");
      return false;
    }

    return true;
  }

  function buildMeterPayload(meterForm) {
    return {
      serial_no: meterForm.serial_no.trim(),
      building_id: Number(meterForm.building_id),
      meter_type: meterForm.meter_type,
      status: meterForm.status,
      initial_reading: meterForm.initial_reading !== "" ? Number(meterForm.initial_reading) : 0,
    };
  }

  async function saveMeter() {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    const payload = buildMeterPayload(form);

    try {
      const isEdit = modal?.mode === "edit";
      const url = isEdit
        ? `${API_BASE_URL}/meters/${modal.meterId}`
        : `${API_BASE_URL}/meters/`;

      const response = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save meter.", "error");
        return;
      }

      showToast(
        isEdit ? "Meter updated successfully." : "Meter added successfully.",
        "success"
      );

      setModal(null);
      setForm(emptyForm);
      await fetchMeters();
    } catch (error) {
      console.error("Save meter error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  function askLoadSamples() {
    setConfirmation({
      type: "loadSamples",
      title: "Load sample meters?",
      message:
        "This will add sample meters to PostgreSQL and assign them to matching sample buildings.",
      note: "Make sure sample buildings are loaded first.",
      confirmText: "Load Samples",
      variant: "success",
    });
  }

  async function confirmLoadSampleMeters() {
    const existingSerials = meters.map((meter) =>
      meter.serial_no.toLowerCase().trim()
    );

    const metersToAdd = sampleMeters.filter(
      (sample) => !existingSerials.includes(sample.serial_no.toLowerCase().trim())
    );

    if (metersToAdd.length === 0) {
      showToast("Sample meters are already loaded.", "success");
      setConfirmation(null);
      return;
    }

    setIsSeeding(true);

    try {
      for (const sample of metersToAdd) {
        const targetBuilding = buildings.find(
          (building) =>
            building.name.toLowerCase().trim() ===
            sample.building_name.toLowerCase().trim()
        );

        if (!targetBuilding) {
          showToast(
            `Cannot add ${sample.serial_no}. Please load sample building "${sample.building_name}" first.`,
            "error"
          );
          return;
        }

        const response = await apiFetch(`${API_BASE_URL}/meters/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            serial_no: sample.serial_no,
            building_id: Number(targetBuilding.building_id),
            meter_type: sample.meter_type,
            status: sample.status,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          showToast(data.detail || `Could not add ${sample.serial_no}.`, "error");
          return;
        }
      }

      showToast(
        `${metersToAdd.length} sample meter records were loaded.`,
        "success"
      );

      setConfirmation(null);
      await fetchMeters();
    } catch (error) {
      console.error("Load sample meters error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsSeeding(false);
    }
  }

  function askRemoveSamples() {
    setConfirmation({
      type: "removeSamples",
      title: "Remove sample meters?",
      message:
        "This will delete only the predefined sample meters from PostgreSQL.",
      note: "This action cannot be automatically undone.",
      confirmText: "Remove Samples",
      variant: "danger",
    });
  }

  async function confirmRemoveSampleMeters() {
    setIsRemovingSamples(true);

    const sampleSerials = sampleMeters.map((sample) =>
      sample.serial_no.toLowerCase().trim()
    );

    const samplesToDelete = meters.filter((meter) =>
      sampleSerials.includes(meter.serial_no.toLowerCase().trim())
    );

    if (samplesToDelete.length === 0) {
      showToast("No sample meters found to remove.", "success");
      setIsRemovingSamples(false);
      setConfirmation(null);
      return;
    }

    try {
      for (const meter of samplesToDelete) {
        const response = await apiFetch(`${API_BASE_URL}/meters/${meter.meter_id}`, {
          method: "DELETE",
        });

        const data = await response.json();

        if (!response.ok) {
          showToast(data.detail || `Could not delete ${meter.serial_no}.`, "error");
          return;
        }
      }

      showToast(`${samplesToDelete.length} sample meter records were removed.`, "success");

      setConfirmation(null);
      await fetchMeters();
    } catch (error) {
      console.error("Remove sample meters error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsRemovingSamples(false);
    }
  }

  function askDeleteMeter(meter) {
    setConfirmation({
      type: "deleteMeter",
      meter,
      title: "Delete meter?",
      message: `You are about to delete meter "${meter.serial_no}".`,
      note: "This may affect OCR readings, reports, and analytics.",
      confirmText: "Delete Meter",
      variant: "danger",
    });
  }

  async function confirmDeleteMeter() {
    const meter = confirmation?.meter;

    if (!meter) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/meters/${meter.meter_id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not delete meter.", "error");
        return;
      }

      showToast(data.message || "Meter deleted successfully.", "success");
      setConfirmation(null);
      await fetchMeters();
    } catch (error) {
      console.error("Delete meter error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleConfirmAction() {
    if (confirmation?.type === "loadSamples") {
      confirmLoadSampleMeters();
      return;
    }

    if (confirmation?.type === "removeSamples") {
      confirmRemoveSampleMeters();
      return;
    }

    if (confirmation?.type === "deleteMeter") {
      confirmDeleteMeter();
    }
  }

  const confirmationProcessing =
    confirmation?.type === "loadSamples"
      ? isSeeding
      : confirmation?.type === "removeSamples"
      ? isRemovingSamples
      : isDeleting;

  return (
    <div className="space-y-6 font-[Nunito]">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <PageHeader
        eyebrow="Meter Records"
        title="Meters Management"
        subtitle="Manage assigned meters and operational status."
        icon={Gauge}
        status={
          isLoadingMeters || isLoadingBuildings
            ? "Syncing data"
            : `${totalMeters} Meters`
        }
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoadingMeters || isLoadingBuildings}
        intervalMs={AUTO_REFRESH_MS}
        actions={
          <>
            <HeaderActionButton
              icon={Database}
              onClick={askLoadSamples}
              disabled={isSeeding}
            >
              {isSeeding ? "Loading..." : "Load Samples"}
            </HeaderActionButton>

            <HeaderActionButton
              icon={Trash2}
              variant="danger"
              onClick={askRemoveSamples}
              disabled={isRemovingSamples}
            >
              {isRemovingSamples ? "Removing..." : "Remove Samples"}
            </HeaderActionButton>

            <HeaderActionButton
              icon={Plus}
              variant="dark"
              onClick={openAddModal}
              disabled={buildings.length === 0}
            >
              Add Meter
            </HeaderActionButton>
          </>
        }
      />

      {buildings.length === 0 && (
        <section className="rounded-[1.7rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white">
              <AlertTriangle size={22} />
            </div>

            <div>
              <h2 className="text-lg font-black text-amber-900">
                No buildings available
              </h2>
              <p className="mt-1 text-sm font-bold leading-6 text-amber-700">
                Add or load buildings first before creating meters.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-500">Total Meters</p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {totalMeters}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Gauge size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-400">
            Stored meter records
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-emerald-700">Active Meters</p>
              <p className="mt-2 text-3xl font-black text-emerald-800">
                {activeMeters}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
              <CheckCircle2 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-emerald-700">
            Available for readings
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-red-700">Inactive Meters</p>
              <p className="mt-2 text-3xl font-black text-red-800">
                {inactiveMeters}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500 text-white">
              <XCircle size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-red-700">Not currently used</p>
        </div>

        <div className="rounded-[1.7rem] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-blue-700">
                Assigned Buildings
              </p>
              <p className="mt-2 text-3xl font-black text-blue-800">
                {assignedBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
              <Building2 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-blue-700">
            With assigned meters
          </p>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Meter List</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Search, filter, view, update, or delete meter records.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[900px] xl:grid-cols-[1fr_160px_160px_180px]">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={18} className="text-slate-400" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search meter, building, type, or status..."
                className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Types">All Types</option>
              {meterTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Status">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
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
                <option key={building.building_id} value={building.building_id}>
                  {building.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-[80px_1fr_1.1fr_0.9fr_130px_130px_120px_160px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Serial No.</div>
              <div>Building</div>
              <div>Meter Type</div>
              <div>Previous</div>
              <div>Latest</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {isLoadingMeters ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading meters...
              </div>
            ) : filteredMeters.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                No meter records found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredMeters.map((meter) => (
                  <div
                    key={meter.meter_id}
                    className="grid grid-cols-[80px_1fr_1.1fr_0.9fr_130px_130px_120px_160px] items-center px-4 py-4 text-sm"
                  >
                    <div className="font-black text-slate-700">
                      #{meter.meter_id}
                    </div>

                    <div>
                      <p className="font-black text-slate-950">
                        {meter.serial_no}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        Meter record
                      </p>
                    </div>

                    <div className="font-bold text-slate-600">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="text-emerald-700" />
                        <span>{getBuildingName(meter.building_id)}</span>
                      </div>
                    </div>

                    <div>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${getTypeStyle(
                          meter.meter_type
                        )}`}
                      >
                        <Gauge size={14} />
                        {meter.meter_type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-black text-slate-700">
                      <History size={15} className="text-slate-400" />
                      <span>
                        {formatReading(meter.previous_reading)}
                        <span className="ml-1 text-xs font-bold text-slate-400">
                          kWh
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-black text-emerald-700">
                      <TrendingUp size={15} className="text-emerald-600" />
                      <span>
                        {formatReading(meter.latest_reading)}
                        <span className="ml-1 text-xs font-bold text-slate-400">
                          kWh
                        </span>
                      </span>
                    </div>

                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                          meter.status
                        )}`}
                      >
                        {getStatusIcon(meter.status)}
                        {meter.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openViewModal(meter)}
                        className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
                        title="View meter"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(meter)}
                        className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                        title="Edit meter"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => askDeleteMeter(meter)}
                        className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                        title="Delete meter"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <MeterModal
        modal={modal}
        form={form}
        setForm={setForm}
        buildings={buildings}
        onClose={() => setModal(null)}
        onSave={saveMeter}
        isSaving={isSaving}
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

export default MetersPage;