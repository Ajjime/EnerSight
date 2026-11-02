import React from "react";
import { Clock3, RefreshCw } from "lucide-react";

function formatLastUpdated(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// One line per page: icon, title, when the data was last refreshed, and the
// page's buttons. Each page used to add a small label above the title, a
// sentence under it and count badges, which said what the title and the cards
// below already say.
export default function PageHeader({
  title,
  icon: Icon,
  lastUpdated,
  isRefreshing = false,
  actions,
}) {
  const updatedAt = formatLastUpdated(lastUpdated);

  return (
    <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon size={19} />
          </span>
        )}

        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">
          {title || "Dashboard"}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        {(updatedAt || isRefreshing) && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500">
            {isRefreshing ? (
              <RefreshCw size={13} className="animate-spin text-emerald-600" />
            ) : (
              <Clock3 size={13} className="text-slate-400" />
            )}

            <span className="whitespace-nowrap">
              {updatedAt ? `Updated ${updatedAt}` : "Loading…"}
            </span>
          </span>
        )}

        {actions}
      </div>
    </section>
  );
}
