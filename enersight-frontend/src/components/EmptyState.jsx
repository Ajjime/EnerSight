import React from "react";

// One empty state for the whole app. Which variant you pick matters more than
// how it looks: "no records exist" and "your filter matched nothing" need
// opposite actions, and the pages used to render the same sentence for both.
//
//   empty    -> nothing has been created yet     -> CTA that creates one
//   filtered -> records exist, filters hide them -> CTA that clears filters
//   blocked  -> a prerequisite is missing        -> CTA to the prerequisite
const VARIANTS = {
  empty: {
    shell: "border-dashed border-slate-300 bg-slate-50",
    icon: "bg-white text-emerald-700 shadow-sm",
    title: "text-slate-800",
    description: "text-slate-500",
  },
  filtered: {
    shell: "border-dashed border-slate-300 bg-slate-50",
    icon: "bg-white text-slate-500 shadow-sm",
    title: "text-slate-800",
    description: "text-slate-500",
  },
  blocked: {
    shell: "border-amber-200 bg-amber-50",
    icon: "bg-amber-500 text-white",
    title: "text-amber-900",
    description: "text-amber-700",
  },
};

export default function EmptyState({
  icon: Icon,
  title = "No records found",
  description,
  action,
  variant = "empty",
  className = "",
}) {
  const style = VARIANTS[variant] || VARIANTS.empty;

  return (
    <div
      className={`grid place-items-center rounded-2xl border p-8 text-center ${style.shell} ${className}`}
    >
      <div className="max-w-sm">
        {Icon && (
          <div
            className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl ${style.icon}`}
          >
            <Icon size={26} />
          </div>
        )}

        <h3 className={`text-lg font-semibold ${style.title}`}>{title}</h3>

        {description && (
          <p className={`mt-2 text-sm font-normal leading-6 ${style.description}`}>
            {description}
          </p>
        )}

        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
