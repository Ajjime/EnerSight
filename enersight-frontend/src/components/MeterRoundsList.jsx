import React, { useState } from "react";
import { Search } from "lucide-react";

// The meter list beside the Add Meter Reading form: this period's round, split
// into meters still to read and meters already read. Figures come from
// utils/meterRounds.js.

const FILTERS = [
  { id: "all", label: "All" },
  { id: "toRead", label: "To read" },
  { id: "done", label: "Done" },
];

function formatShortDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function describeWait(entry, isCurrentPeriod) {
  if (!entry.latest) {
    return "Never read";
  }

  if (!isCurrentPeriod) {
    return "Not read";
  }

  if (entry.daysSinceLatest <= 0) {
    return "Today";
  }

  return entry.daysSinceLatest === 1 ? "1 day" : `${entry.daysSinceLatest} days`;
}

function MeterRow({ entry, isDone, isSelected, isCurrentPeriod, buildingName, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.meter.meter_id)}
      aria-current={isSelected ? "true" : undefined}
      className={`grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
        isSelected ? "bg-emerald-50" : "hover:bg-slate-100"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isDone ? "bg-emerald-500" : "bg-amber-500"}`}
      />

      <span className="min-w-0">
        <span
          className={`block truncate text-[13px] ${
            isSelected ? "font-bold text-emerald-800" : "font-semibold text-slate-900"
          }`}
        >
          {entry.meter.serial_no || `Meter #${entry.meter.meter_id}`}
        </span>
        <span className="block truncate text-xs font-normal text-slate-500">
          {buildingName}
        </span>
      </span>

      <span className="whitespace-nowrap text-xs font-medium text-slate-500">
        {isDone
          ? formatShortDate(entry.periodReading.reading_date)
          : describeWait(entry, isCurrentPeriod)}
      </span>
    </button>
  );
}

function Group({ title, children }) {
  return (
    <div>
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function MeterRoundsList({
  toRead,
  done,
  selectedMeterId,
  onSelect,
  getBuildingName,
  isCurrentPeriod = true,
  className = "",
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const search = query.trim().toLowerCase();
  const matches = (entry) =>
    !search ||
    String(entry.meter.serial_no || "").toLowerCase().includes(search) ||
    getBuildingName(entry.meter.building_id).toLowerCase().includes(search);

  const visibleToRead = filter === "done" ? [] : toRead.filter(matches);
  const visibleDone = filter === "toRead" ? [] : done.filter(matches);
  const counts = {
    all: toRead.length + done.length,
    toRead: toRead.length,
    done: done.length,
  };

  const renderRow = (entry, isDone) => (
    <MeterRow
      key={entry.meter.meter_id}
      entry={entry}
      isDone={isDone}
      isSelected={Number(entry.meter.meter_id) === Number(selectedMeterId)}
      isCurrentPeriod={isCurrentPeriod}
      buildingName={getBuildingName(entry.meter.building_id)}
      onSelect={onSelect}
    />
  );

  return (
    <aside aria-label="Meters" className={`flex-col gap-3 px-4 py-5 ${className}`}>
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold text-slate-900">Meters</h2>
        <span className="text-xs font-normal text-slate-500">{counts.all} total</span>
      </div>

      <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-emerald-600">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search meter or building"
          aria-label="Search meters"
          className="w-full bg-transparent text-[13px] font-normal text-slate-700 outline-none placeholder:text-slate-400"
        />
      </label>

      <div
        role="group"
        aria-label="Filter meters"
        className="grid grid-cols-3 gap-0.5 rounded-xl bg-slate-100 p-[3px]"
      >
        {FILTERS.map((option) => {
          const isActive = filter === option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(option.id)}
              className={`min-h-8 rounded-xl text-xs font-semibold transition ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {option.label} {counts[option.id]}
            </button>
          );
        })}
      </div>

      <div className="-mx-1 flex max-h-[640px] flex-col gap-4 overflow-y-auto px-1 pt-1">
        {visibleToRead.length > 0 && (
          <Group title="To read">
            {visibleToRead.map((entry) => renderRow(entry, false))}
          </Group>
        )}

        {visibleDone.length > 0 && (
          <Group title="Done this period">
            {visibleDone.map((entry) => renderRow(entry, true))}
          </Group>
        )}

        {visibleToRead.length === 0 && visibleDone.length === 0 && (
          <p className="px-1 py-6 text-center text-[13px] font-normal text-slate-500">
            {counts.all === 0
              ? "No meters yet."
              : filter === "toRead" && !search
                ? "Every meter has been read this period."
                : "No meters match."}
          </p>
        )}
      </div>
    </aside>
  );
}
