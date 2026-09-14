import React from "react";

// One stat card for the whole app. Dashboard, Analytics, BuildingMap and
// ProfilePage each used to carry a near-identical private copy; they differed
// only in prop names, so both spellings are accepted here:
//   tone / color              -> palette key ("green" and "emerald" are the same)
//   description / subtitle    -> the small line under the value
const PALETTE = {
  green: {
    bg: "border-emerald-100 bg-emerald-50",
    label: "text-emerald-700",
    value: "text-emerald-800",
    icon: "bg-emerald-700 text-white",
  },
  blue: {
    bg: "border-blue-100 bg-blue-50",
    label: "text-blue-700",
    value: "text-blue-800",
    icon: "bg-blue-600 text-white",
  },
  amber: {
    bg: "border-amber-100 bg-amber-50",
    label: "text-amber-700",
    value: "text-amber-800",
    icon: "bg-amber-500 text-white",
  },
  red: {
    bg: "border-red-100 bg-red-50",
    label: "text-red-700",
    value: "text-red-800",
    icon: "bg-red-500 text-white",
  },
  purple: {
    bg: "border-purple-100 bg-purple-50",
    label: "text-purple-700",
    value: "text-purple-800",
    icon: "bg-purple-600 text-white",
  },
  dark: {
    bg: "border-slate-200 bg-white",
    label: "text-slate-500",
    value: "text-slate-950",
    icon: "bg-slate-950 text-lime-300",
  },
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  tone,
  color,
  description,
  subtitle,
  // Free-text values (a building or account name) wrap and need a smaller
  // size than a formatted number does.
  compactValue = false,
  // Opt-in stagger. The `analyticsCardIn` keyframe is declared in Analytics.jsx's
  // inline <style>, so only that page should pass this until it moves to index.css.
  animDelay = null,
  className = "",
}) {
  const key = tone || color || "dark";
  const palette = PALETTE[key === "emerald" ? "green" : key] || PALETTE.dark;
  const caption = description ?? subtitle;

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${palette.bg} ${className}`}
      style={
        animDelay === null
          ? undefined
          : { animation: `analyticsCardIn 420ms ease-out ${animDelay}ms both` }
      }
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${palette.label}`}>{title}</p>

          <p
            className={`mt-2 break-words font-bold leading-tight ${palette.value} ${
              compactValue ? "text-xl xl:text-2xl" : "text-3xl"
            }`}
          >
            {value}
          </p>
        </div>

        {Icon && (
          <div
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${palette.icon}`}
          >
            <Icon size={23} />
          </div>
        )}
      </div>

      {caption && (
        <p className={`text-xs font-normal leading-5 ${palette.label}`}>
          {caption}
        </p>
      )}
    </div>
  );
}
