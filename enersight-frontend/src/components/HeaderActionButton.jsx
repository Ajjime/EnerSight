import React from "react";

export default function HeaderActionButton({
  children,
  icon: Icon,
  variant = "light",
  disabled = false,
  onClick,
}) {
  const className =
    variant === "dark"
      ? "bg-slate-950 text-white hover:bg-emerald-700"
      : variant === "danger"
      ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
      : variant === "success"
      ? "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}
