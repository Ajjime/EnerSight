import React from "react";
import { Clock3, RefreshCw } from "lucide-react";

function formatLastUpdated(value) {
  if (!value) {
    return "--:--";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInterval(intervalMs) {
  const seconds = Math.round(Number(intervalMs || 0) / 1000);

  if (!seconds || Number.isNaN(seconds)) {
    return "Auto";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.round(seconds / 60);

  return `${minutes}m`;
}

function HeaderPill({ children }) {
  if (!children) {
    return null;
  }

  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium leading-none text-slate-600">
      {children}
    </span>
  );
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  role,
  status,
  lastUpdated,
  isRefreshing = false,
  intervalMs,
  actions,
  children,
}) {
  const showAutoRefresh = Boolean(lastUpdated || intervalMs || isRefreshing);
  const hasPills = Boolean(role || status || children);

  return (
    <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon size={19} />
          </span>
        )}

        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {eyebrow}
            </p>
          )}

          <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-slate-900">
            {title || "Dashboard"}
          </h1>

          {subtitle && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              {subtitle}
            </p>
          )}

          {hasPills && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {role && <HeaderPill>Role: {role}</HeaderPill>}
              {status && <HeaderPill>{status}</HeaderPill>}
              {children}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        {showAutoRefresh && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500">
            {isRefreshing ? (
              <RefreshCw size={13} className="animate-spin text-emerald-600" />
            ) : (
              <Clock3 size={13} className="text-slate-400" />
            )}

            <span className="whitespace-nowrap">
              {formatInterval(intervalMs)} · {formatLastUpdated(lastUpdated)}
            </span>
          </span>
        )}

        {actions}
      </div>
    </section>
  );
}
