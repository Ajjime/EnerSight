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
      ? "border border-red-100 bg-white/95 text-red-700 hover:bg-red-50"
      : variant === "success"
      ? "border border-emerald-100 bg-white/95 text-emerald-700 hover:bg-emerald-50"
      : "border border-white/20 bg-white/15 text-white hover:bg-white/25";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}
