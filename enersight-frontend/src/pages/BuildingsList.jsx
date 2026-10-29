import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Database,
  Eye,
  Layers,
  MapPinned,
  Pencil,
  Plug,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import HeaderActionButton from "../components/HeaderActionButton";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import LocationPickerModal from "../components/LocationPickerModal";
import EmptyState from "../components/EmptyState";
import SkeletonRows from "../components/SkeletonRows";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { formatNumber } from "../utils/format";
import { useElectricityRate } from "../hooks/useElectricityRate";
import RateNotice from "../components/RateNotice";
import {
  DEFAULT_RATE_PER_KWH,
  applianceKwhMonth,
  formatPeso,
} from "../utils/currency";
import {
  EMPTY_APPLIANCE_FORM,
  isApplianceDraftStarted,
  validateApplianceForm,
} from "../utils/appliances";
const AUTO_REFRESH_MS = 60000;

// Loaded on first open: the profile brings Recharts and Leaflet, which this page
// otherwise never needs.
const BuildingProfile = lazy(() => import("../components/BuildingProfile"));

// Common appliances with typical wattage — picking one pre-fills the form.
const appliancePresets = [
  { label: "Aircon (1.0 HP)", category: "Cooling", wattage: 750, hours_per_day: 8, days_per_month: 30 },
  { label: "Aircon (1.5 HP)", category: "Cooling", wattage: 1120, hours_per_day: 8, days_per_month: 30 },
  { label: "Aircon (2.0 HP)", category: "Cooling", wattage: 1490, hours_per_day: 8, days_per_month: 30 },
  { label: "Ceiling Fan", category: "Cooling", wattage: 75, hours_per_day: 10, days_per_month: 30 },
  { label: "Stand Fan", category: "Cooling", wattage: 60, hours_per_day: 10, days_per_month: 30 },
  { label: "Refrigerator", category: "Kitchen", wattage: 150, hours_per_day: 24, days_per_month: 30 },
  { label: "Water Dispenser", category: "Kitchen", wattage: 550, hours_per_day: 24, days_per_month: 30 },
  { label: "Microwave", category: "Kitchen", wattage: 1000, hours_per_day: 1, days_per_month: 30 },
  { label: "LED Light", category: "Lighting", wattage: 10, hours_per_day: 10, days_per_month: 30 },
  { label: "Fluorescent Light", category: "Lighting", wattage: 40, hours_per_day: 10, days_per_month: 30 },
  { label: "Desktop Computer", category: "Office", wattage: 200, hours_per_day: 8, days_per_month: 22 },
  { label: "Laptop", category: "Office", wattage: 65, hours_per_day: 8, days_per_month: 22 },
  { label: "Printer", category: "Office", wattage: 50, hours_per_day: 2, days_per_month: 22 },
  { label: "Television", category: "Others", wattage: 100, hours_per_day: 5, days_per_month: 30 },
];

const applianceCategories = [
  "Cooling",
  "Lighting",
  "Kitchen",
  "Office",
  "Laboratory",
  "Others",
];

const emptyForm = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  floor_area: "",
  building_type: "Office",
  status: "Active",
};

// Kept in step with DEMO_BUILDINGS in enersight-backend/seed_demo_data.py, so
// loading samples here and seeding from the backend cannot produce two competing
// sets of campus buildings. Generic names on the DNSC Panabo campus - not a
// roster of real facilities.
const sampleBuildings = [
  {
    name: "Administration Building",
    latitude: 7.31389,
    longitude: 125.67127,
    floor_area: 2400,
    building_type: "Office",
    status: "Active",
  },
  {
    name: "Institute of Computing",
    latitude: 7.31425,
    longitude: 125.67185,
    floor_area: 1800,
    building_type: "Laboratory",
    status: "Active",
  },
  {
    name: "Learning Resource Center",
    latitude: 7.31352,
    longitude: 125.67068,
    floor_area: 1600,
    building_type: "Support",
    status: "Active",
  },
  {
    name: "Science Laboratory Building",
    latitude: 7.31461,
    longitude: 125.67102,
    floor_area: 1250,
    building_type: "Office",
    status: "Active",
  },
  {
    name: "Student Center",
    latitude: 7.31318,
    longitude: 125.67214,
    floor_area: 1400,
    building_type: "Support",
    status: "Active",
  },
  {
    name: "Maintenance and Storage",
    latitude: 7.31278,
    longitude: 125.67035,
    floor_area: 900,
    building_type: "Warehouse",
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
          {isError ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {isError ? "Something went wrong" : "Success"}
          </p>

          <p className="mt-1 text-sm font-normal leading-5 opacity-80">
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
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>

      {children}

      {helper && (
        <p className="mt-2 text-xs font-normal leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </label>
  );
}

function CoordinateCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
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
  rate,
  newAppliances,
  setNewAppliances,
  applianceDraft,
  setApplianceDraft,
}) {
  if (!modal) {
    return null;
  }

  const isAdd = modal.mode === "add";

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/60 p-4">
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl ${
          isAdd ? "max-w-4xl" : "max-w-3xl"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Building Record
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {isAdd ? "Add Building" : "Edit Building"}
            </h2>

            <p className="mt-1 text-sm font-normal text-slate-500">
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
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Example: Admin Building"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field label="Building Type">
              <select
                value={form.building_type}
                onChange={(event) =>
                  setForm({ ...form, building_type: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
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
                helper="Click the map to capture latitude and longitude."
              >
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white">
                        <MapPinned size={23} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-emerald-900">
                          {form.latitude && form.longitude
                            ? "Location selected"
                            : "No location selected"}
                        </p>

                        <p className="mt-1 text-xs font-normal leading-5 text-emerald-700">
                          Use map picker instead of manual typing.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onOpenLocationPicker}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <MapPinned size={18} />
                      Select Location on Map
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Address
                      </p>
                      <p className="mt-1 break-words text-sm font-normal leading-5 text-slate-800">
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
                type="number"
                step="any"
                value={form.floor_area}
                onChange={(event) =>
                  setForm({ ...form, floor_area: event.target.value })
                }
                placeholder="Example: 1200"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field label="Operational Status">
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            {isAdd && (
              <NewBuildingAppliances
                appliances={newAppliances}
                setAppliances={setNewAppliances}
                draft={applianceDraft}
                setDraft={setApplianceDraft}
                rate={rate}
              />
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white p-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : isAdd && newAppliances.length > 0
              ? `Save Building + ${newAppliances.length} Appliance${
                  newAppliances.length === 1 ? "" : "s"
                }`
              : "Save Building"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The appliance inputs: quick pick, the six fields and a live estimate. Shared by
// the appliance manager (plug icon) and the appliance list inside Add Building.
function ApplianceFields({ form, setForm, rate }) {
  function applyPreset(label) {
    const preset = appliancePresets.find((item) => item.label === label);

    if (!preset) {
      return;
    }

    setForm((current) => ({
      ...current,
      name: preset.label,
      category: preset.category,
      wattage: String(preset.wattage),
      hours_per_day: String(preset.hours_per_day),
      days_per_month: String(preset.days_per_month),
    }));
  }

  const estimateKwh = applianceKwhMonth(form);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Quick Pick" helper="Auto-fills name, category, wattage, and typical usage. You can still edit any field.">
        <select
          value=""
          onChange={(event) => applyPreset(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-emerald-600"
        >
          <option value="">Select common appliance...</option>
          {appliancePresets.map((preset) => (
            <option key={preset.label} value={preset.label}>
              {preset.label} ({preset.wattage} W)
            </option>
          ))}
        </select>
      </Field>

      <Field label="Appliance Name">
        <input
          value={form.name}
          onChange={(event) =>
            setForm({ ...form, name: event.target.value })
          }
          placeholder="Example: Split-type Aircon"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600"
        />
      </Field>

      <Field label="Category">
        <select
          value={form.category}
          onChange={(event) =>
            setForm({ ...form, category: event.target.value })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-emerald-600"
        >
          {applianceCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Wattage (W)" helper="Rated power on the label.">
        <input
          type="number"
          step="any"
          min="0"
          value={form.wattage}
          onChange={(event) =>
            setForm({ ...form, wattage: event.target.value })
          }
          placeholder="Example: 1120"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600"
        />
      </Field>

      <Field label="Quantity">
        <input
          type="number"
          min="1"
          value={form.quantity}
          onChange={(event) =>
            setForm({ ...form, quantity: event.target.value })
          }
          placeholder="1"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600"
        />
      </Field>

      <Field label="Hours / Day">
        <input
          type="number"
          step="any"
          min="0"
          max="24"
          value={form.hours_per_day}
          onChange={(event) =>
            setForm({ ...form, hours_per_day: event.target.value })
          }
          placeholder="Example: 8"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600"
        />
      </Field>

      <Field label="Days / Month">
        <input
          type="number"
          min="1"
          max="31"
          value={form.days_per_month}
          onChange={(event) =>
            setForm({ ...form, days_per_month: event.target.value })
          }
          placeholder="30"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600"
        />
      </Field>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 xl:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          This appliance ≈
        </p>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          {formatNumber(Math.round(estimateKwh))}{" "}
          kWh ·{" "}
          {formatPeso(estimateKwh * rate)}{" "}
          / month
        </p>
      </div>
    </div>
  );
}

// Add Building only. Appliances listed here stay in the form until Save Building,
// which creates the building and then each appliance under it, so a new building
// and its inventory take one step instead of a save followed by the plug icon.
function NewBuildingAppliances({
  appliances,
  setAppliances,
  draft,
  setDraft,
  rate,
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [draftError, setDraftError] = useState("");

  const totalKwh = appliances.reduce(
    (sum, appliance) => sum + applianceKwhMonth(appliance),
    0
  );

  function updateDraft(next) {
    setDraftError("");
    setDraft(next);
  }

  function clearDraft() {
    setDraft(EMPTY_APPLIANCE_FORM);
    setEditingIndex(null);
    setDraftError("");
  }

  function addToList() {
    const { payload, error } = validateApplianceForm(draft);

    if (error) {
      setDraftError(error);
      return;
    }

    setAppliances((current) =>
      editingIndex === null
        ? [...current, payload]
        : current.map((item, index) => (index === editingIndex ? payload : item))
    );
    clearDraft();
  }

  function editItem(index) {
    const item = appliances[index];

    setEditingIndex(index);
    setDraftError("");
    setDraft({
      name: item.name,
      category: item.category,
      wattage: String(item.wattage),
      quantity: String(item.quantity),
      hours_per_day: String(item.hours_per_day),
      days_per_month: String(item.days_per_month),
    });
  }

  function removeItem(index) {
    setAppliances((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );

    if (editingIndex === index) {
      clearDraft();
    } else if (editingIndex !== null && index < editingIndex) {
      setEditingIndex(editingIndex - 1);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime-50 text-lime-700">
            <Plug size={18} />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">
              Appliances{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </p>
            <p className="mt-0.5 text-xs font-normal leading-5 text-slate-500">
              Add them now and they are saved with the building. You can still
              change them later with the plug icon.
            </p>
          </div>
        </div>

        {appliances.length > 0 && (
          <div className="text-right text-xs font-normal text-slate-500">
            <p>
              <span className="font-semibold text-slate-950">
                {appliances.length}
              </span>{" "}
              appliance{appliances.length === 1 ? "" : "s"}
            </p>
            <p>
              <span className="font-semibold text-emerald-700">
                {formatNumber(Math.round(totalKwh))} kWh
              </span>{" "}
              · {formatPeso(totalKwh * rate)} / month
            </p>
          </div>
        )}
      </div>

      {appliances.length > 0 && (
        <div className="overflow-x-auto border-b border-slate-100">
          <div className="min-w-[600px] divide-y divide-slate-100">
            {appliances.map((appliance, index) => {
              const kwh = applianceKwhMonth(appliance);
              const isEditing = editingIndex === index;

              return (
                <div
                  key={`${appliance.name}-${index}`}
                  className={`grid grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr_84px] items-center gap-3 px-4 py-3 text-sm ${
                    isEditing ? "bg-emerald-50/60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className="truncate font-semibold text-slate-950"
                      title={appliance.name}
                    >
                      {appliance.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {appliance.category}
                    </p>
                  </div>
                  <div className="text-slate-600">
                    {formatNumber(appliance.wattage)} W × {appliance.quantity}
                  </div>
                  <div className="text-slate-600">
                    {appliance.hours_per_day} h/day · {appliance.days_per_month} d
                  </div>
                  <div className="font-semibold text-slate-950">
                    {formatNumber(Math.round(kwh))} kWh
                  </div>
                  <div className="font-semibold text-emerald-700">
                    {formatPeso(kwh * rate, { decimals: 0 })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => editItem(index)}
                      className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                      title="Edit appliance"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                      title="Remove from list"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-b-2xl bg-slate-50 p-4">
        <ApplianceFields form={draft} setForm={updateDraft} rate={rate} />

        {draftError && (
          <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {draftError}
          </p>
        )}

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {(editingIndex !== null || isApplianceDraftStarted(draft)) && (
            <button
              type="button"
              onClick={clearDraft}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {editingIndex !== null ? "Cancel Edit" : "Clear"}
            </button>
          )}

          <button
            type="button"
            onClick={addToList}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            {editingIndex !== null ? <Pencil size={17} /> : <Plus size={17} />}
            {editingIndex !== null ? "Update Appliance" : "Add to List"}
          </button>
        </div>
      </div>
    </div>
  );
}

const APPLIANCE_ROW_COLUMNS = "1.6fr 0.8fr 0.7fr 0.9fr 1fr 1fr 90px";

function ApplianceModal({ building, rate, onClose, showToast }) {
  const [appliances, setAppliances] = useState([]);
  const [form, setForm] = useState(EMPTY_APPLIANCE_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Appliance deletion used to fire on the first click, unlike buildings and
  // meters which both confirm first.
  const [pendingDelete, setPendingDelete] = useState(null);

  const buildingId = building?.building_id;

  async function fetchAppliances() {
    if (!buildingId) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/appliances/?building_id=${buildingId}`
      );
      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not load appliances.", "error");
        return;
      }

      setAppliances(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch appliances error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAppliances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId]);

  function resetForm() {
    setForm(EMPTY_APPLIANCE_FORM);
    setEditingId(null);
  }

  function startEdit(appliance) {
    setEditingId(appliance.appliance_id);
    setForm({
      name: appliance.name || "",
      category: appliance.category || "Others",
      wattage: String(appliance.wattage ?? ""),
      quantity: String(appliance.quantity ?? "1"),
      hours_per_day: String(appliance.hours_per_day ?? ""),
      days_per_month: String(appliance.days_per_month ?? "30"),
    });
  }

  async function submitForm() {
    const { payload: fields, error: invalid } = validateApplianceForm(form);

    if (invalid) {
      showToast(invalid, "error");
      return;
    }

    setIsSaving(true);

    const payload = { building_id: buildingId, ...fields };

    try {
      const url = editingId
        ? `${API_BASE_URL}/appliances/${editingId}`
        : `${API_BASE_URL}/appliances/`;

      const response = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save appliance.", "error");
        return;
      }

      showToast(
        editingId ? "Appliance updated." : "Appliance added.",
        "success"
      );
      resetForm();
      await fetchAppliances();
    } catch (error) {
      console.error("Save appliance error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAppliance(appliance) {
    setIsSaving(true);
    setPendingDelete(null);

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/appliances/${appliance.appliance_id}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not delete appliance.", "error");
        return;
      }

      if (editingId === appliance.appliance_id) {
        resetForm();
      }

      showToast("Appliance removed.", "success");
      await fetchAppliances();
    } catch (error) {
      console.error("Delete appliance error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  const totalKwh = appliances.reduce(
    (sum, appliance) => sum + applianceKwhMonth(appliance),
    0
  );
  const totalCost = totalKwh * rate;

  if (!building) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Appliance Inventory
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {building.name}
            </h2>
            <p className="mt-1 text-sm font-normal text-slate-500">
              Estimated monthly energy use based on each appliance's wattage.
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
          {/* Totals */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Appliances
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-950">
                {appliances.length}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Est. Energy / Month
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">
                {formatNumber(Math.round(totalKwh))} kWh
              </p>
            </div>
            <div className="rounded-2xl border border-slate-900 bg-slate-950 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-300">
                Est. Cost / Month
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatPeso(totalCost)}
              </p>
            </div>
          </div>

          {/* Add / edit form */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Plug size={16} className="text-emerald-700" />
              <p className="text-sm font-semibold text-slate-950">
                {editingId ? "Edit Appliance" : "Add Appliance"}
              </p>
            </div>

            <ApplianceFields form={form} setForm={setForm} rate={rate} />

            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}

              <button
                type="button"
                onClick={submitForm}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editingId ? <Pencil size={17} /> : <Plus size={17} />}
                {isSaving
                  ? "Saving..."
                  : editingId
                  ? "Update Appliance"
                  : "Add Appliance"}
              </button>
            </div>
          </div>

          {/* Appliance list */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[1.6fr_0.8fr_0.7fr_0.9fr_1fr_1fr_90px] bg-slate-50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                <div>Appliance</div>
                <div>Watts</div>
                <div>Qty</div>
                <div>Hrs/Day</div>
                <div>kWh/Mo</div>
                <div>₱/Mo</div>
                <div>Actions</div>
              </div>

              {isLoading ? (
                <SkeletonRows
                  columns={APPLIANCE_ROW_COLUMNS}
                  rows={3}
                  rowHeight={56}
                />
              ) : appliances.length === 0 ? (
                <EmptyState
                  icon={Plug}
                  title="No appliances yet"
                  description="Add an appliance above to estimate this building's consumption and cost without a metered reading."
                  className="m-4"
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {appliances.map((appliance) => {
                    const kwh = applianceKwhMonth(appliance);

                    return (
                      <div
                        key={appliance.appliance_id}
                        className="grid grid-cols-[1.6fr_0.8fr_0.7fr_0.9fr_1fr_1fr_90px] items-center px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">
                            {appliance.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-normal text-slate-400">
                            {appliance.category || "Uncategorized"}
                          </p>
                        </div>
                        <div className="font-medium text-slate-600">
                          {formatNumber(appliance.wattage)} W
                        </div>
                        <div className="font-medium text-slate-600">
                          {appliance.quantity}
                        </div>
                        <div className="font-medium text-slate-600">
                          {appliance.hours_per_day}
                        </div>
                        <div className="font-semibold text-slate-950">
                          {formatNumber(Math.round(kwh))}
                        </div>
                        <div className="font-semibold text-emerald-700">
                          {formatPeso(kwh * rate)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(appliance)}
                            className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                            title="Edit appliance"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(appliance)}
                            className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                            title="Delete appliance"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white p-6">
          <p className="text-xs font-normal leading-5 text-slate-500">
            Formula: watts × qty × hours/day × days/month ÷ 1000 = kWh.
            Rate: {formatPeso(rate)} / kWh.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title="Delete this appliance?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed from ${
                building?.name || "this building"
              }.`
            : ""
        }
        note="The building's estimated consumption and cost will change."
        confirmText="Delete Appliance"
        variant="danger"
        isProcessing={isSaving}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => deleteAppliance(pendingDelete)}
      />
    </div>
  );
}

// Kept next to each real row's grid-cols-[...] class so the two stay in step.
const BUILDING_ROW_COLUMNS = "90px 1.2fr 1fr 1.2fr 1fr 130px 210px";

const BuildingsList = ({ role = "Staff" }) => {
  // Deleting a building is Admin-only on the backend (buildings.py). Managers can
  // create and edit, so hide only the destructive actions rather than showing
  // buttons that answer 403.
  const canDelete = role === "Admin";

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
  const [applianceBuilding, setApplianceBuilding] = useState(null);
  const [profileBuilding, setProfileBuilding] = useState(null);
  // Appliances listed inside Add Building, saved after the building itself.
  const [newAppliances, setNewAppliances] = useState([]);
  const [applianceDraft, setApplianceDraft] = useState(EMPTY_APPLIANCE_FORM);
  const { rate, isFallback: isRateFallback, error: rateError } = useElectricityRate();

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
      enabled:
        !modal &&
        !confirmation &&
        !isLocationPickerOpen &&
        !applianceBuilding &&
        !profileBuilding,
      runOnMount: true,
    }
  );

  // Rate loading moved to a shared hook so a failure is visible instead of
  // silently pricing everything at the default rate.

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

  // Tells the two empty cases apart: nothing saved yet vs. filters hiding
  // everything. They need opposite calls to action.
  const hasActiveFilters =
    query.trim() !== "" ||
    typeFilter !== "All Types" ||
    statusFilter !== "All Status";

  function clearFilters() {
    setQuery("");
    setTypeFilter("All Types");
    setStatusFilter("All Status");
  }

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
    setNewAppliances([]);
    setApplianceDraft(EMPTY_APPLIANCE_FORM);
    setModal({ mode: "add" });
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

  // Creates each listed appliance under the new building. The building already
  // exists by now, so a failure here is reported rather than undoing it.
  async function saveNewAppliances(buildingId) {
    let failed = 0;
    let firstError = "";

    for (const appliance of newAppliances) {
      try {
        const response = await apiFetch(`${API_BASE_URL}/appliances/`, {
          method: "POST",
          body: JSON.stringify({ building_id: buildingId, ...appliance }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          failed += 1;
          firstError ||= typeof data.detail === "string" ? data.detail : "";
        }
      } catch (error) {
        console.error("Save appliance error:", error);
        failed += 1;
        firstError ||= "Cannot connect to server.";
      }
    }

    return { failed, firstError };
  }

  async function saveBuilding() {
    if (!validateForm()) {
      return;
    }

    const isEdit = modal?.mode === "edit";

    // Saving now would silently drop what they typed.
    if (!isEdit && isApplianceDraftStarted(applianceDraft)) {
      showToast(
        "Finish the appliance you started: click Add to List (or Update Appliance), or Clear it.",
        "error"
      );
      return;
    }

    setIsSaving(true);

    const payload = buildPayload(form);

    try {

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

      const applianceCount = isEdit ? 0 : newAppliances.length;
      const { failed, firstError } = applianceCount
        ? await saveNewAppliances(data.building_id)
        : { failed: 0, firstError: "" };

      if (failed > 0) {
        showToast(
          `Building added, but ${failed} of ${applianceCount} appliance${
            applianceCount === 1 ? "" : "s"
          } could not be saved${firstError ? ` (${firstError})` : ""}. Add ${
            failed === 1 ? "it" : "them"
          } with the plug icon.`,
          "error"
        );
      } else {
        showToast(
          isEdit
            ? "Building updated successfully."
            : applianceCount
            ? `Building added with ${applianceCount} appliance${
                applianceCount === 1 ? "" : "s"
              }.`
            : "Building added successfully.",
          "success"
        );
      }

      setModal(null);
      setForm(emptyForm);
      setNewAppliances([]);
      setApplianceDraft(EMPTY_APPLIANCE_FORM);
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
    <div className="space-y-6">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <RateNotice isFallback={isRateFallback} error={rateError} />

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

            {canDelete && (
              <HeaderActionButton
                icon={Trash2}
                variant="danger"
                onClick={askRemoveSamples}
                disabled={isRemovingSamples}
              >
                {isRemovingSamples ? "Removing..." : "Remove Samples"}
              </HeaderActionButton>
            )}

            <HeaderActionButton icon={Plus} variant="dark" onClick={openAddModal}>
              Add Building
            </HeaderActionButton>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Total Buildings
              </p>

              <p className="mt-2 text-3xl font-bold text-slate-950">
                {totalBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Building2 size={23} />
            </div>
          </div>

          <p className="text-xs font-normal text-slate-400">
            Stored building records
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-700">
                Active Buildings
              </p>

              <p className="mt-2 text-3xl font-bold text-emerald-800">
                {activeBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
              <CheckCircle2 size={23} />
            </div>
          </div>

          <p className="text-xs font-normal text-emerald-700">
            Included in monitoring
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-700">
                Inactive Buildings
              </p>

              <p className="mt-2 text-3xl font-bold text-red-800">
                {inactiveBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500 text-white">
              <XCircle size={23} />
            </div>
          </div>

          <p className="text-xs font-normal text-red-700">
            Excluded from active use
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">GIS Mapped</p>

              <p className="mt-2 text-3xl font-bold text-blue-800">
                {mappedBuildings}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
              <MapPinned size={23} />
            </div>
          </div>

          <p className="text-xs font-normal text-blue-700">
            With valid coordinates
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Building List
            </h2>

            <p className="mt-1 text-sm font-normal text-slate-500">
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
                className="w-full bg-transparent text-sm font-normal text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
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
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
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

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[90px_1.2fr_1fr_1.2fr_1fr_130px_210px] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Building</div>
              <div>Type</div>
              <div>GIS Location</div>
              <div>Floor Area</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {isLoading ? (
              <SkeletonRows columns={BUILDING_ROW_COLUMNS} rows={5} />
            ) : filteredBuildings.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  variant="filtered"
                  icon={Search}
                  title="No buildings match your filters"
                  description="Try a different search term, or reset the filters to see every building."
                  action={
                    <HeaderActionButton icon={X} onClick={clearFilters}>
                      Clear filters
                    </HeaderActionButton>
                  }
                  className="m-4"
                />
              ) : (
                <EmptyState
                  icon={Building2}
                  title="No buildings yet"
                  description="Add your first building to start mapping energy consumption and generating reports."
                  action={
                    <HeaderActionButton
                      icon={Plus}
                      variant="dark"
                      onClick={openAddModal}
                    >
                      Add Building
                    </HeaderActionButton>
                  }
                  className="m-4"
                />
              )
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBuildings.map((building) => (
                  <div
                    key={building.building_id}
                    onClick={() => setProfileBuilding(building)}
                    className="grid h-[72px] cursor-pointer grid-cols-[90px_1.2fr_1fr_1.2fr_1fr_130px_210px] items-center overflow-hidden px-4 text-sm transition hover:bg-emerald-50/40"
                  >
                    <div className="font-semibold text-slate-700">
                      #{building.building_id}
                    </div>

                    <div className="min-w-0 overflow-hidden">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setProfileBuilding(building);
                        }}
                        className="block max-w-full truncate text-left font-semibold text-slate-950 hover:text-emerald-700 hover:underline"
                      >
                        {building.name}
                      </button>

                      <p className="mt-1 truncate text-xs font-normal text-slate-400" title={building.address || "No address"}>
                        {building.address || "No address"}
                      </p>
                    </div>

                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        <Layers size={14} />
                        {building.building_type}
                      </span>
                    </div>

                    <div className="font-medium text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapPinned size={15} className="text-emerald-700" />

                        <span>
                          {building.latitude}, {building.longitude}
                        </span>
                      </div>
                    </div>

                    <div className="font-semibold text-slate-700">
                      {formatNumber(building.floor_area)} sqm
                    </div>

                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${getStatusStyle(
                          building.status
                        )}`}
                      >
                        {getStatusIcon(building.status)}
                        {building.status}
                      </span>
                    </div>

                    {/* The row opens the profile; these buttons do their own thing. */}
                    <div
                      className="flex flex-wrap gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setProfileBuilding(building)}
                        className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
                        title="View building profile"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setApplianceBuilding(building)}
                        className="rounded-xl bg-lime-50 p-2 text-lime-700 transition hover:bg-lime-100"
                        title="Manage appliances"
                      >
                        <Plug size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(building)}
                        className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                        title="Edit building"
                      >
                        <Pencil size={16} />
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => askDeleteBuilding(building)}
                          className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                          title="Delete building"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
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
        rate={rate}
        newAppliances={newAppliances}
        setNewAppliances={setNewAppliances}
        applianceDraft={applianceDraft}
        setApplianceDraft={setApplianceDraft}
      />

      {profileBuilding && (
        <Suspense fallback={null}>
          <BuildingProfile
            key={profileBuilding.building_id}
            buildingId={profileBuilding.building_id}
            buildingName={profileBuilding.name}
            onClose={() => setProfileBuilding(null)}
          />
        </Suspense>
      )}

      {applianceBuilding && (
        <ApplianceModal
          building={applianceBuilding}
          rate={rate}
          onClose={() => setApplianceBuilding(null)}
          showToast={showToast}
        />
      )}

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