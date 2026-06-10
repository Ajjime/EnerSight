import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

export function PageHeader({
  eyebrow = "EnerSight GIS",
  title,
  description,
  icon,
  action,
}) {
  const Icon = icon;

  return (
    <section className="energy-soft-card relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-emerald-100" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-emerald-100/70" />

      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          {Icon && (
            <div className="energy-icon-green shrink-0">
              <Icon size={25} />
            </div>
          )}

          <div>
            <p className="energy-label">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-slate-950">
              {title}
            </h1>

            {description && (
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-500">
                {description}
              </p>
            )}
          </div>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}

export function EnergyCard({ children, className = "" }) {
  return (
    <section className={`energy-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function EnergyStatCard({
  title,
  value,
  subtitle,
  icon,
  color = "green",
  badge,
}) {
  const Icon = icon;

  const iconClass =
    color === "amber"
      ? "energy-icon-amber"
      : color === "red"
      ? "energy-icon-red"
      : color === "lime"
      ? "energy-icon-lime"
      : "energy-icon-green";

  return (
    <div className="energy-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-500">{title}</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {value}
          </h2>
          {subtitle && (
            <p className="mt-1 text-xs font-bold text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div className={iconClass}>
            <Icon size={24} />
          </div>
        )}
      </div>

      {badge && <div className="mt-4">{badge}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  if (
    normalized === "active" ||
    normalized === "normal" ||
    normalized === "verified"
  ) {
    return (
      <span className="energy-badge-green">
        <CheckCircle2 size={14} />
        {status}
      </span>
    );
  }

  if (
    normalized === "pending" ||
    normalized === "warning" ||
    normalized === "needs review" ||
    normalized === "high"
  ) {
    return (
      <span className="energy-badge-amber">
        <Clock size={14} />
        {status}
      </span>
    );
  }

  if (
    normalized === "rejected" ||
    normalized === "critical" ||
    normalized === "invalid"
  ) {
    return (
      <span className="energy-badge-red">
        <XCircle size={14} />
        {status}
      </span>
    );
  }

  return (
    <span className="energy-badge-blue">
      <AlertTriangle size={14} />
      {status || "Info"}
    </span>
  );
}

export function EmptyState({
  title = "No records found",
  description = "There is no data to show yet.",
  icon,
}) {
  const Icon = icon;

  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      {Icon && (
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <Icon size={26} />
        </div>
      )}

      <h3 className="text-lg font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-bold text-slate-500">{description}</p>
    </div>
  );
}

export function FormField({
  label,
  children,
  helper,
}) {
  return (
    <label className="block">
      <span className="mb-2 block energy-label">{label}</span>
      {children}

      {helper && (
        <p className="mt-2 text-xs font-bold text-slate-500">{helper}</p>
      )}
    </label>
  );
}