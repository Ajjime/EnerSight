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
    <span className="inline-flex min-h-8 max-w-full items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black leading-none text-white shadow-sm">
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
    <section className="relative min-h-[260px] overflow-hidden rounded-[1.7rem] bg-gradient-to-br from-emerald-950 via-emerald-800 to-lime-500 p-8 text-white shadow-sm">
      <div className="pointer-events-none absolute inset-0 opacity-25">
        <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-lime-300/30 blur-3xl" />
      </div>

      {showAutoRefresh && (
        <div className="absolute right-4 top-4 z-20 inline-flex h-6 items-center gap-1.5 rounded-full border border-white/20 bg-white px-2.5 text-[10px] font-black text-emerald-800 shadow-sm">
          {isRefreshing ? (
            <RefreshCw size={10} className="animate-spin" />
          ) : (
            <Clock3 size={10} />
          )}

          <span className="whitespace-nowrap">
            {formatInterval(intervalMs)} • {formatLastUpdated(lastUpdated)}
          </span>
        </div>
      )}

      <div className="relative z-10 max-w-5xl pr-0 md:pr-40">
        <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 shadow-sm">
          {Icon && (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime-300/20 text-lime-200">
              <Icon size={14} />
            </span>
          )}

          <span className="truncate text-xs font-black uppercase tracking-[0.32em] text-lime-100">
            {eyebrow || "EnerSight"}
          </span>
        </div>

        <h1 className="text-4xl font-black leading-tight tracking-tight text-white md:text-5xl">
          {title || "Dashboard"}
        </h1>

        {subtitle && (
          <p className="mt-4 max-w-4xl text-base font-bold leading-7 text-emerald-50 md:text-lg">
            {subtitle}
          </p>
        )}

        {hasPills && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {role && <HeaderPill>Role: {role}</HeaderPill>}
            {status && <HeaderPill>{status}</HeaderPill>}
            {children}
          </div>
        )}
      </div>

      {actions && (
        <div className="relative z-20 mt-8 flex flex-wrap items-center gap-3 md:absolute md:bottom-7 md:right-7 md:mt-0 md:justify-end">
          {actions}
        </div>
      )}
    </section>
  );
}
