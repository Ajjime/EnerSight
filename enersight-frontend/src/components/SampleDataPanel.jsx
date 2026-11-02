import React, { useState } from "react";
import { Database, Trash2 } from "lucide-react";

import API_BASE_URL from "../config";
import ConfirmationModal from "./ConfirmationModal";
import { apiFetch } from "../utils/apiFetch";
import { SERVER_UNREACHABLE } from "../utils/messages";
import {
  SAMPLE_BUILDINGS,
  sampleBuildingPayload,
  sampleMeterPayload,
  samplesToAdd,
  samplesToRemove,
} from "../utils/sampleData";

// Admin-only, on the Settings page. The Load Samples and Remove Samples buttons
// used to sit beside "Add Building" and "Add Meter", where a red delete button is
// easy to hit by mistake, for something only used when preparing a demo.

async function fetchList(path) {
  const response = await apiFetch(`${API_BASE_URL}${path}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not load the current records.");
  }

  return Array.isArray(data) ? data : [];
}

async function send(path, options) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "The server refused the change.");
  }

  return data;
}

async function loadSamples() {
  const [buildings, meters] = await Promise.all([
    fetchList("/buildings/"),
    fetchList("/meters/"),
  ]);
  const plan = samplesToAdd(buildings, meters);
  const idByName = new Map(
    buildings.map((building) => [building.name.toLowerCase().trim(), building.building_id])
  );

  for (const sample of plan.buildings) {
    const created = await send("/buildings/", {
      method: "POST",
      body: JSON.stringify(sampleBuildingPayload(sample)),
    });
    idByName.set(sample.name.toLowerCase().trim(), created.building_id);
  }

  for (const { serial, index, buildingName } of plan.meters) {
    const buildingId = idByName.get(buildingName.toLowerCase().trim());
    await send("/meters/", {
      method: "POST",
      body: JSON.stringify(sampleMeterPayload(serial, buildingId, index)),
    });
  }

  return plan;
}

// The backend refuses to delete a meter or building that has readings, to keep
// consumption history. Those are skipped and counted instead of stopping the run.
async function removeSamples() {
  const [buildings, meters] = await Promise.all([
    fetchList("/buildings/"),
    fetchList("/meters/"),
  ]);
  const plan = samplesToRemove(buildings, meters);
  const result = { buildings: 0, meters: 0, kept: 0 };

  for (const meter of plan.meters) {
    const response = await apiFetch(`${API_BASE_URL}/meters/${meter.meter_id}`, {
      method: "DELETE",
    });
    result[response.ok ? "meters" : "kept"] += 1;
  }

  for (const building of plan.buildings) {
    const response = await apiFetch(
      `${API_BASE_URL}/buildings/${building.building_id}`,
      { method: "DELETE" }
    );
    result[response.ok ? "buildings" : "kept"] += 1;
  }

  return result;
}

function countLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const SAMPLE_METER_COUNT = SAMPLE_BUILDINGS.reduce(
  (total, sample) => total + sample.meters.length,
  0
);

const ACTIONS = {
  load: {
    title: "Load sample data?",
    message: `Adds ${countLabel(SAMPLE_BUILDINGS.length, "sample building")} and ${countLabel(SAMPLE_METER_COUNT, "meter")}. Ones that already exist are skipped.`,
    confirmText: "Load sample data",
    variant: "success",
  },
  remove: {
    title: "Remove sample data?",
    message:
      "Deletes the sample buildings and meters. Your own records stay, and so does anything that already has readings.",
    confirmText: "Remove sample data",
    variant: "danger",
  },
};

export default function SampleDataPanel({ showToast }) {
  const [pending, setPending] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  async function run() {
    setIsWorking(true);

    try {
      if (pending === "load") {
        const plan = await loadSamples();
        const added = plan.buildings.length + plan.meters.length;

        showToast(
          added === 0
            ? "Sample data is already loaded."
            : `Added ${countLabel(plan.buildings.length, "building")} and ${countLabel(plan.meters.length, "meter")}.`,
          "success"
        );
      } else {
        const result = await removeSamples();
        const removed = result.buildings + result.meters;
        const kept = result.kept
          ? ` Kept ${result.kept} that already ${result.kept === 1 ? "has" : "have"} readings.`
          : "";

        showToast(
          removed === 0 && !result.kept
            ? "No sample data to remove."
            : `Removed ${countLabel(result.buildings, "building")} and ${countLabel(result.meters, "meter")}.${kept}`,
          "success"
        );
      }
    } catch (error) {
      console.error("Sample data error:", error);
      showToast(
        error instanceof TypeError ? SERVER_UNREACHABLE : error.message,
        "error"
      );
    } finally {
      setIsWorking(false);
      setPending(null);
    }
  }

  const action = pending ? ACTIONS[pending] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-lime-300">
            <Database size={23} />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-950">Sample data</h2>
            <p className="mt-1 text-sm font-normal text-slate-500">
              Demo buildings and meters, for testing or a presentation.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPending("load")}
            disabled={isWorking}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Database size={16} />
            Load
          </button>

          <button
            type="button"
            onClick={() => setPending("remove")}
            disabled={isWorking}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={16} />
            Remove
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={Boolean(action)}
        title={action?.title}
        message={action?.message}
        confirmText={action?.confirmText}
        variant={action?.variant}
        isProcessing={isWorking}
        onCancel={() => setPending(null)}
        onConfirm={run}
      />
    </section>
  );
}
