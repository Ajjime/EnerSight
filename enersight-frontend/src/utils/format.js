// Shared number formatting.
//
// There used to be six copies of formatNumber across the pages, and they disagreed:
// Dashboard, Analytics and BuildingMap rounded, while Reports, BuildingsList and
// UploadOCR did not. So the same kWh figure rendered as "1,234" on one page and
// "1,234.5600000001" on another, which looks like a data problem rather than a
// formatting one.

/** Whole-unit display for kWh and counts. */
export function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return Math.round(number).toLocaleString();
}

/** Two-decimal display, for intensity figures like kWh/m². */
export function formatDecimal(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return (0).toFixed(decimals);
  }

  return number.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Abbreviated display for tight spaces: 1.2K, 3.4M. */
export function formatCompact(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  if (Math.abs(number) >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(number) >= 1_000) {
    return `${(number / 1_000).toFixed(1)}K`;
  }

  return Math.round(number).toLocaleString();
}
