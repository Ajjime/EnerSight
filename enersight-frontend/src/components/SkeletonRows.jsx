import React from "react";

// Placeholder rows shown while a table loads.
//
// `columns` is a CSS grid-template-columns VALUE (e.g. "90px 1.2fr 1fr 130px"),
// not a Tailwind class. Tailwind's compiler only emits classes it can see as
// literal strings at build time, so a template built at runtime
// (`grid-cols-[${columns}]`) would never make it into the stylesheet. Mirror the
// real row's arbitrary class here as an inline style instead — that keeps the
// skeleton the same width per column, so nothing shifts when the data lands.
export default function SkeletonRows({
  columns,
  rows = 5,
  rowHeight = 72,
  // Widths cycle per column so the block looks like text of varying length
  // rather than a set of identical bars.
  widths = ["55%", "80%", "65%", "75%", "60%", "70%"],
}) {
  const columnCount = String(columns).trim().split(/\s+/).length;

  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid items-center gap-4 px-4"
          style={{ gridTemplateColumns: columns, height: rowHeight }}
        >
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <div
              key={columnIndex}
              className="energy-skeleton h-3.5 rounded-full"
              style={{ width: widths[columnIndex % widths.length] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
