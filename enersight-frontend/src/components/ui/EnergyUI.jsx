import React from "react";

// Only FormField survives here — the auth pages (SignIn, SignUpRole,
// ForgotPassword) are its only consumers. This file used to also export a
// PageHeader, EnergyCard, EnergyStatCard, StatusBadge and EmptyState that
// nothing rendered; they were removed so there is one PageHeader in the
// codebase (src/components/PageHeader.jsx) instead of two.
export function FormField({ label, children, helper }) {
  return (
    <label className="block">
      <span className="mb-2 block energy-label">{label}</span>
      {children}

      {helper && (
        <p className="mt-2 text-xs font-normal text-slate-500">{helper}</p>
      )}
    </label>
  );
}
