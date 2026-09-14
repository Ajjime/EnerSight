import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Shown when the electricity rate could not be loaded, which means every peso
 * figure on the page is the built-in default rather than the configured value.
 *
 * Before this existed the four pages that show costs swallowed the failure
 * silently, so a page could confidently print "At ₱12.00 / kWh" while having no
 * idea what the real rate was.
 */
export default function RateNotice({ isFallback, error, className = "" }) {
  if (!isFallback || !error) {
    return null;
  }

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ${className}`}
    >
      <AlertTriangle size={17} className="mt-0.5 shrink-0" />
      <span>{error} Costs shown here are estimates only.</span>
    </div>
  );
}
