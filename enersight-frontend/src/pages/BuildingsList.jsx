import React, { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Database,
  Eye,
  Layers,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import HeaderActionButton from "../components/HeaderActionButton";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import LocationPickerModal from "../components/LocationPickerModal";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
const AUTO_REFRESH_MS = 60000;

const emptyForm = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  floor_area: "",
  building_type: "Office",
  status: "Active",
};

const sampleBuildings = [
  {
    name: "Admin Building",
    latitude: 7.3089,
    longitude: 125.6841,
    floor_area: 1200,
    building_type: "Office",
    status: "Active",
  },
  {
    name: "Engineering Building",
    latitude: 7.3093,
    longitude: 125.6848,
    floor_area: 1850,
    building_type: "Laboratory",
    status: "Active",
  },
  {
    name: "Library",
    latitude: 7.3084,
    longitude: 125.6835,
    floor_area: 980,
    building_type: "Support",
    status: "Active",
  },
  {
    name: "Warehouse",
    latitude: 7.3101,
    longitude: 125.6853,
    floor_area: 2100,
    building_type: "Warehouse",
    status: "Active",
  },
  {
    name: "Laboratory Building",
    latitude: 7.3098,
    longitude: 125.6829,
    floor_area: 1450,
    building_type: "Laboratory",
    status: "Active",
  },
];

const buildingTypes = [
  "Office",
  "Warehouse",
  "Laboratory",
  "Production",
  "Storage",
  "Support",
  "Commercial",
];

const statusOptions = ["Active", "Inactive"];

function normalizeBuilding(building) {
  return {
    building_id: building.building_id,
    name: building.name || "",
    address: building.address || "",
    latitude: building.latitude ?? "",
    longitude: building.longitude ?? "",
    floor_area: building.floor_area ?? "",
    building_type: building.building_type || "Office",
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

  return <Building2 size={15} />;
}

function formatNumber(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "0";
  }

  return numericValue.toLocaleString();
}

function buildPayload(form) {
  return {
    name: form.name.trim(),
    address: form.address || null,
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    floor_area: Number(form.floor_area),
    building_type: form.building_type,
    status: form.status,
  };
}

function ToastMessage({ message, type = "success", onClose }) {
  if (!message) {
    return null;
  }

  const isError = type === "error";

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
          {isError ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {isError ? "Something went wrong" : "Success"}
          </p>

          <p className="mt-1 text-sm font-bold leading-5 opacity-80">
            {message}
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

function CoordinateCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-black text-slate-800">
        {value || "Not selected"}
      </p>
    </div>
  );
}


function BuildingModal({
  modal,
  form,
  setForm,
  onClose,
  onSave,
  isSaving,
  onOpenLocationPicker,
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
              Building Record
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {modal.mode === "add"
                ? "Add Building"
                : modal.mode === "edit"
                ? "Edit Building"
                : "Building Details"}
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Used for GIS mapping and energy monitoring.
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
            <Field label="Building Name">
              <input
                disabled={isView}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Example: Admin Building"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field label="Building Type">
              <select
                disabled={isView}
                value={form.building_type}
                onChange={(event) =>
                  setForm({ ...form, building_type: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {buildingTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <div className="md:col-span-2">
              <Field
                label="Building Location"
                helper={
                  isView
                    ? "Saved GIS coordinate of the building."
                    : "Click the map to capture latitude and longitude."
                }
              >
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white">
                        <MapPinned size={23} />
                      </div>

                      <div>
                        <p className="text-sm font-black text-emerald-900">
                          {form.latitude && form.longitude
                            ? "Location selected"
                            : "No location selected"}
                        </p>

                        <p className="mt-1 text-xs font-bold leading-5 text-emerald-700">
                          {isView
                            ? "Coordinates are shown below."
                            : "Use map picker instead of manual typing."}
                        </p>
                      </div>
                    </div>

                    {!isView && (
                      <button
                        type="button"
                        onClick={onOpenLocationPicker}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        <MapPinned size={18} />
                        Select Location on Map
                      </button>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        Address
                      </p>
                      <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-800">
                        {form.address || "Not selected"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <CoordinateCard label="Latitude" value={form.latitude} />
                      <CoordinateCard label="Longitude" value={form.longitude} />
                    </div>
                  </div>
                </div>
              </Field>
            </div>

            <Field label="Floor Area" helper="Used for EUI calculation.">
              <input
                disabled={isView}
                type="number"
                step="any"
                value={form.floor_area}
                onChange={(event) =>
                  setForm({ ...form, floor_area: event.target.value })
                }
                placeholder="Example: 1200"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
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
              {isSaving ? "Saving..." : "Save Building"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const BuildingsList = () => {
  const [buildings, setBuildings] = useState([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [modal, setModal] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRemovingSamples, setIsRemovingSamples] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function showToast(message, type = "success") {
    setToast({ message, type });

    window.setTimeout(() => {
      setToast({ message: "", type: "success" });
    }, 2500);
  }

  function hideToast() {
    setToast({ message: "", type: "success" });
  }

  async function fetchBuildings(showSuccessToast = false) {
    setIsLoading(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/buildings/`);
      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not load buildings.", "error");
        return;
      }

      setBuildings(Array.isArray(data) ? data.map(normalizeBuilding) : []);

      if (showSuccessToast) {
        showToast("Building data refreshed successfully.", "success");
      }
    } catch (error) {
      console.error("Fetch buildings error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(
    () => fetchBuildings(false),
    {
      intervalMs: AUTO_REFRESH_MS,
      enabled: !modal && !confirmation && !isLocationPickerOpen,
      runOnMount: true,
    }
  );

  const filteredBuildings = useMemo(() => {
    return buildings.filter((building) => {
      const searchValue = query.toLowerCase();

      const matchesSearch =
        building.name.toLowerCase().includes(searchValue) ||
        building.building_type.toLowerCase().includes(searchValue) ||
        building.status.toLowerCase().includes(searchValue) ||
        String(building.latitude).toLowerCase().includes(searchValue) ||
        String(building.longitude).toLowerCase().includes(searchValue);

      const matchesType =
        typeFilter === "All Types" || building.building_type === typeFilter;

      const matchesStatus =
        statusFilter === "All Status" || building.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [buildings, query, typeFilter, statusFilter]);

  const totalBuildings = buildings.length;

  const activeBuildings = buildings.filter(
    (building) => building.status === "Active"
  ).length;

  const inactiveBuildings = buildings.filter(
    (building) => building.status === "Inactive"
  ).length;

  const mappedBuildings = buildings.filter(
    (building) => building.latitude !== "" && building.longitude !== ""
  ).length;

  function openAddModal() {
    setForm(emptyForm);
    setModal({ mode: "add" });
  }

  function openViewModal(building) {
    setForm(normalizeBuilding(building));
    setModal({ mode: "view", buildingId: building.building_id });
  }

  function openEditModal(building) {
    setForm(normalizeBuilding(building));
    setModal({ mode: "edit", buildingId: building.building_id });
  }

  function handleConfirmLocation(location) {
    setForm((currentForm) => ({
      ...currentForm,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address || "",
    }));

    showToast("Building location selected successfully.", "success");
  }

  function validateForm() {
    if (!form.name.trim()) {
      showToast("Please enter the building name.", "error");
      return false;
    }

    if (form.latitude === "" || Number.isNaN(Number(form.latitude))) {
      showToast("Please select a valid building location on the map.", "error");
      return false;
    }

    if (form.longitude === "" || Number.isNaN(Number(form.longitude))) {
      showToast("Please select a valid building location on the map.", "error");
      return false;
    }

    if (form.floor_area === "" || Number.isNaN(Number(form.floor_area))) {
      showToast("Please enter a valid floor area.", "error");
      return false;
    }

    return true;
  }

  async function saveBuilding() {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    const payload = buildPayload(form);

    try {
      const isEdit = modal?.mode === "edit";

      const url = isEdit
        ? `${API_BASE_URL}/buildings/${modal.buildingId}`
        : `${API_BASE_URL}/buildings/`;

      const response = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save building.", "error");
        return;
      }

      showToast(
        isEdit
          ? "Building updated successfully."
          : "Building added successfully.",
        "success"
      );

      setModal(null);
      setForm(emptyForm);
      await fetchBuildings(false);
    } catch (error) {
      console.error("Save building error:", error);
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
      title: "Load sample buildings?",
      message:
        "This will add predefined sample building records to PostgreSQL. Existing sample buildings will not be duplicated.",
      note: "Use this only for demo, testing, or presentation preparation.",
      confirmText: "Load Samples",
      variant: "success",
    });
  }

  async function confirmLoadSampleBuildings() {
    const existingNames = buildings.map((building) =>
      building.name.toLowerCase().trim()
    );

    const buildingsToAdd = sampleBuildings.filter(
      (sample) => !existingNames.includes(sample.name.toLowerCase().trim())
    );

    if (buildingsToAdd.length === 0) {
      showToast("Sample buildings are already loaded.", "success");
      setConfirmation(null);
      return;
    }

    setIsSeeding(true);

    try {
      for (const sample of buildingsToAdd) {
        const response = await apiFetch(`${API_BASE_URL}/buildings/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sample),
        });

        const data = await response.json();

        if (!response.ok) {
          showToast(data.detail || `Could not add ${sample.name}.`, "error");
          return;
        }
      }

      showToast(
        `${buildingsToAdd.length} sample building records were loaded.`,
        "success"
      );

      setConfirmation(null);
      await fetchBuildings(false);
    } catch (error) {
      console.error("Load sample buildings error:", error);
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
      title: "Remove sample buildings?",
      message:
        "This will delete only the predefined sample buildings from PostgreSQL. Your manually added buildings will stay.",
      note: "This action cannot be automatically undone.",
      confirmText: "Remove Samples",
      variant: "danger",
    });
  }

  async function confirmRemoveSampleBuildings() {
    setIsRemovingSamples(true);

    const sampleNames = sampleBuildings.map((sample) =>
      sample.name.toLowerCase().trim()
    );

    const samplesToDelete = buildings.filter((building) =>
      sampleNames.includes(building.name.toLowerCase().trim())
    );

    if (samplesToDelete.length === 0) {
      showToast("No sample buildings found to remove.", "success");
      setIsRemovingSamples(false);
      setConfirmation(null);
      return;
    }

    try {
      for (const building of samplesToDelete) {
        const response = await apiFetch(
          `${API_BASE_URL}/buildings/${building.building_id}`,
          {
            method: "DELETE",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          showToast(data.detail || `Could not delete ${building.name}.`, "error");
          return;
        }
      }

      showToast(
        `${samplesToDelete.length} sample building records were removed.`,
        "success"
      );

      setConfirmation(null);
      await fetchBuildings(false);
    } catch (error) {
      console.error("Remove sample buildings error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsRemovingSamples(false);
    }
  }

  function askDeleteBuilding(building) {
    setConfirmation({
      type: "deleteBuilding",
      building,
      title: "Delete building?",
      message: `You are about to delete "${building.name}" from the building records.`,
      note: "This may affect GIS mapping, meter assignment, and reports.",
      confirmText: "Delete Building",
      variant: "danger",
    });
  }

  async function confirmDeleteBuilding() {
    const building = confirmation?.building;

    if (!building) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/buildings/${building.building_id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not delete building.", "error");
        return;
      }

      showToast(data.message || "Building deleted successfully.", "success");
      setConfirmation(null);
      await fetchBuildings(false);
    } catch (error) {
      console.error("Delete building error:", error);
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
      confirmLoadSampleBuildings();
      return;
    }

    if (confirmation?.type === "removeSamples") {
      confirmRemoveSampleBuildings();
      return;
    }

    if (confirmation?.type === "deleteBuilding") {
      confirmDeleteBuilding();
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
        eyebrow="Building Records"
        title="Buildings Management"
        subtitle="Manage building records, locations, and monitoring status."
        icon={Building2}
        status={isLoading ? "Syncing data" : `${totalBuildings} Buildings`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoading}
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

            <HeaderActionButton icon={Plus} variant="dark" onClick={openAddModal}>
              Add Building
            </HeaderActionButton>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-500">
                Total Buildings
              </p>

              <p className="mt-2 text-3xl font-black text-slate-950">
                {totalBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Building2 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-400">
            Stored building records
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-emerald-700">
                Active Buildings
              </p>

              <p className="mt-2 text-3xl font-black text-emerald-800">
                {activeBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
              <CheckCircle2 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-emerald-700">
            Included in monitoring
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-red-700">
                Inactive Buildings
              </p>

              <p className="mt-2 text-3xl font-black text-red-800">
                {inactiveBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500 text-white">
              <XCircle size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-red-700">
            Excluded from active use
          </p>
        </div>

        <div className="rounded-[1.7rem] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-blue-700">GIS Mapped</p>

              <p className="mt-2 text-3xl font-black text-blue-800">
                {mappedBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
              <MapPinned size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-blue-700">
            With valid coordinates
          </p>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              Building List
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Search, filter, view, update, or delete building records.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_160px] xl:w-[760px]">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2 lg:col-span-1">
              <Search size={18} className="text-slate-400" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search building, type, status, or coordinates..."
                className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Types">All Types</option>

              {buildingTypes.map((type) => (
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
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[90px_1.2fr_1fr_1.2fr_1fr_130px_170px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Building</div>
              <div>Type</div>
              <div>GIS Location</div>
              <div>Floor Area</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading buildings...
              </div>
            ) : filteredBuildings.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                No building records found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBuildings.map((building) => (
                  <div
                    key={building.building_id}
                    className="grid grid-cols-[90px_1.2fr_1fr_1.2fr_1fr_130px_170px] items-center px-4 text-sm h-[72px] overflow-hidden"
                  >
                    <div className="font-black text-slate-700">
                      #{building.building_id}
                    </div>

                    <div className="min-w-0 overflow-hidden">
                      <p className="truncate font-black text-slate-950">
                        {building.name}
                      </p>

                      <p className="mt-1 truncate text-xs font-bold text-slate-400" title={building.address || "No address"}>
                        {building.address || "No address"}
                      </p>
                    </div>

                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                        <Layers size={14} />
                        {building.building_type}
                      </span>
                    </div>

                    <div className="font-bold text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapPinned size={15} className="text-emerald-700" />

                        <span>
                          {building.latitude}, {building.longitude}
                        </span>
                      </div>
                    </div>

                    <div className="font-black text-slate-700">
                      {formatNumber(building.floor_area)} sqm
                    </div>

                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                          building.status
                        )}`}
                      >
                        {getStatusIcon(building.status)}
                        {building.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openViewModal(building)}
                        className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
                        title="View building"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(building)}
                        className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                        title="Edit building"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => askDeleteBuilding(building)}
                        className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                        title="Delete building"
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

      <BuildingModal
        modal={modal}
        form={form}
        setForm={setForm}
        onClose={() => setModal(null)}
        onSave={saveBuilding}
        isSaving={isSaving}
        onOpenLocationPicker={() => setIsLocationPickerOpen(true)}
      />

      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        onConfirm={handleConfirmLocation}
        initialLatitude={form.latitude}
        initialLongitude={form.longitude}
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

export default BuildingsList;