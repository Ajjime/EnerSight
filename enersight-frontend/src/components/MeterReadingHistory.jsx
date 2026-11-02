import React from "react";

import { isManualReading } from "../utils/readingQuality";

// The selected meter's latest readings under the Add Meter Reading form, with the
// reading being entered shown first as a draft so it can be compared with them.
// Rows come from getMeterHistory in utils/meterRounds.js.

const HEAD_CLASS =
  "px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500";
const CELL_CLASS = "px-3.5 py-2.5";

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function formatPerDay(value) {
  return value === null || value === undefined ? "—" : value.toFixed(1);
}

function StatusPill({ tone, children }) {
  const style = {
    verified: "border-emerald-100 bg-emerald-50 text-emerald-700",
    review: "border-amber-100 bg-amber-50 text-amber-700",
    draft: "border-slate-300 bg-white text-slate-700",
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {children}
    </span>
  );
}

export default function MeterReadingHistory({ rows, draft, onViewAll }) {
  const isEmpty = rows.length === 0 && !draft;

  return (
    <div className="border-t border-slate-200 px-5 py-5 sm:px-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-slate-900">Reading history</h3>
        <button
          type="button"
          onClick={onViewAll}
          className="text-[13px] font-semibold text-emerald-700 transition hover:text-emerald-900"
        >
          View all readings
        </button>
      </div>

      {isEmpty ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] font-normal text-slate-500">
          No saved readings for this meter yet. The first one also needs its previous
          value typed in.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[620px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th scope="col" className={HEAD_CLASS}>Date</th>
                <th scope="col" className={`${HEAD_CLASS} text-right`}>Reading (kWh)</th>
                <th scope="col" className={`${HEAD_CLASS} text-right`}>Used (kWh)</th>
                <th scope="col" className={`${HEAD_CLASS} text-right`}>Per day</th>
                <th scope="col" className={HEAD_CLASS}>Source</th>
                <th scope="col" className={HEAD_CLASS}>Status</th>
              </tr>
            </thead>

            <tbody>
              {draft && (
                <tr className="border-t border-slate-200 bg-emerald-50/60">
                  <td className={`${CELL_CLASS} font-semibold text-slate-900`}>
                    {formatDate(draft.date)}
                  </td>
                  <td className={`${CELL_CLASS} text-right font-semibold text-slate-900`}>
                    {draft.value.toLocaleString()}
                  </td>
                  <td className={`${CELL_CLASS} text-right text-slate-700`}>
                    {draft.used === null ? "—" : draft.used.toLocaleString()}
                  </td>
                  <td className={`${CELL_CLASS} text-right text-slate-700`}>
                    {formatPerDay(draft.perDay)}
                  </td>
                  <td className={`${CELL_CLASS} text-slate-600`}>{draft.source}</td>
                  <td className={CELL_CLASS}>
                    <StatusPill tone="draft">Draft</StatusPill>
                  </td>
                </tr>
              )}

              {rows.map((row) => (
                <tr key={row.reading.record_id} className="border-t border-slate-100">
                  <td className={`${CELL_CLASS} text-slate-700`}>
                    {formatDate(row.reading.reading_date)}
                  </td>
                  <td className={`${CELL_CLASS} text-right font-semibold text-slate-900`}>
                    {Number(row.reading.reading_value).toLocaleString()}
                  </td>
                  <td className={`${CELL_CLASS} text-right text-slate-700`}>
                    {Math.round(row.used).toLocaleString()}
                  </td>
                  <td className={`${CELL_CLASS} text-right text-slate-700`}>
                    {formatPerDay(row.perDay)}
                  </td>
                  <td className={`${CELL_CLASS} text-slate-600`}>
                    {isManualReading(row.reading) ? "Manual" : "OCR"}
                  </td>
                  <td className={CELL_CLASS}>
                    <StatusPill tone={row.reading.is_verified ? "verified" : "review"}>
                      {row.reading.is_verified ? "Verified" : "Needs Review"}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
