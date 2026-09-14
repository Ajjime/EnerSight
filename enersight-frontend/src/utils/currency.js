// Default electricity rate (PHP per kWh) used until the backend value loads.
export const DEFAULT_RATE_PER_KWH = 12;

// Formats a peso amount, e.g. 3225.6 -> "₱3,225.60".
export function formatPeso(value, { decimals = 2 } = {}) {
  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return "₱0.00";
  }

  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// Estimated monthly energy (kWh) for an appliance.
// Energy (kWh) = watts × quantity × hours/day × days/month ÷ 1000.
export function applianceKwhMonth({
  wattage,
  quantity,
  hours_per_day,
  days_per_month,
}) {
  const watts = Number(wattage) || 0;
  const qty = Number(quantity) || 0;
  const hours = Number(hours_per_day) || 0;
  const days = Number(days_per_month) || 0;

  return (watts * qty * hours * days) / 1000;
}
