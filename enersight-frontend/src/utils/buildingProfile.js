// Everything the Building Profile panel says about one building.
//
// It is computed from the same four tables Dashboard, Analytics and Reports read
// (/buildings/, /meters/, /readings/, /appliances/) and graded by the same rules,
// so a building cannot be Critical on the map and Normal in its own profile.
//
// Measured and estimated consumption stay in separate fields. Meter readings are
// what the building used; the appliance list is what it should use. They are
// compared, never added together.

import {
  MIN_DAYS_TO_ANNUALIZE,
  annotateReadingCoverage,
  annualizeEui,
  computeEui,
  getEnergyStatus,
  getReadingSpanDays,
} from "./energyStatus";
import { applianceKwhMonth } from "./currency";
import { fillMonthGaps, MONTH_LABELS } from "./forecast";
import {
  getAverageOcrAccuracy,
  getOcrScore,
  isLowOcrAccuracy,
  isManualReading,
} from "./readingQuality";

const DAYS_PER_MONTH = 365 / 12;

// Measured use within 15% of the appliance estimate counts as a match. Analytics
// grades its measured-vs-estimate section with the same figure.
export const APPLIANCE_GAP_TOLERANCE = 0.15;

function toTime(value) {
  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

function getMonthSortKey(value) {
  const time = toTime(value);

  if (time === null) {
    return "";
  }

  const date = new Date(time);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(sortKey) {
  const [year, month] = sortKey.split("-").map(Number);

  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** present − previous, never negative. Same rule as reading_differential in the backend. */
export function getReadingDifferential(reading) {
  const present = Number(reading?.reading_value || 0);
  const previous = Number(reading?.previous_reading ?? 0);

  return Math.max(present - previous, 0);
}

/**
 * Monthly measured kWh, oldest first, with empty calendar months kept at zero so
 * the chart spacing is real time (see fillMonthGaps).
 */
export function buildMonthlyConsumption(readings, rate = 0) {
  const grouped = new Map();

  (readings || []).forEach((reading) => {
    const sortKey = getMonthSortKey(reading.reading_date);

    if (!sortKey) {
      return;
    }

    if (!grouped.has(sortKey)) {
      grouped.set(sortKey, { sortKey, month: getMonthLabel(sortKey), value: 0, readingCount: 0 });
    }

    const point = grouped.get(sortKey);
    point.value += getReadingDifferential(reading);
    point.readingCount += 1;
  });

  const points = [...grouped.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return fillMonthGaps(points).map((point, index, all) => {
    const previous = index > 0 ? all[index - 1].value : null;

    return {
      ...point,
      readingCount: point.readingCount || 0,
      cost: point.value * rate,
      change: previous > 0 ? (point.value - previous) / previous : null,
    };
  });
}

/**
 * How measured use compares with the appliance estimate. `gap` is the fraction
 * measured sits above (+) or below (−) the estimate; null when either side is
 * missing.
 */
export function getApplianceComparison(measuredKwhMonth, estimatedKwhMonth, hasAppliances) {
  if (!hasAppliances) {
    return { gap: null, tone: "none", text: "No appliance list for this building yet." };
  }

  if (!(estimatedKwhMonth > 0)) {
    return {
      gap: null,
      tone: "none",
      text: "The appliance list adds up to 0 kWh. Check the wattage and hours entered.",
    };
  }

  if (measuredKwhMonth === null) {
    return {
      gap: null,
      tone: "none",
      text: "Not enough readings yet to work out a monthly figure to compare against.",
    };
  }

  const gap = (measuredKwhMonth - estimatedKwhMonth) / estimatedKwhMonth;
  const percent = `${Math.round(Math.abs(gap) * 100)}%`;

  if (gap > APPLIANCE_GAP_TOLERANCE) {
    return {
      gap,
      tone: gap > 0.5 ? "red" : "amber",
      text: `Uses ${percent} more than its appliances explain. Look for unlisted equipment, longer operating hours, or waste.`,
    };
  }

  if (gap < -APPLIANCE_GAP_TOLERANCE) {
    return {
      gap,
      tone: "blue",
      text: `Uses ${percent} less than estimated. The listed hours or quantities may be too high.`,
    };
  }

  return { gap, tone: "green", text: "Measured use matches the appliance list within 15%." };
}

export function getProfileRecommendation({ status, floorArea, readingCount, lowAccuracyCount, pendingCount }) {
  if (status === "Critical") {
    return "Immediate review recommended. Check equipment usage, schedules and the latest meter readings.";
  }

  if (status === "High") {
    return "Monitor this building closely and compare it with its previous readings.";
  }

  if (status === "No Data") {
    if (!(floorArea > 0)) {
      return "Add this building's floor area on the Buildings page so its energy intensity can be graded.";
    }

    return readingCount > 0
      ? "Readings are saved but show no consumption yet. A second reading on the same meter gives the first kWh figure."
      : "No meter readings yet. Record a reading to start monitoring this building.";
  }

  if (lowAccuracyCount > 0) {
    return `${lowAccuracyCount} photo reading${lowAccuracyCount === 1 ? "" : "s"} scored below 90%. Re-check those photos before reporting.`;
  }

  if (pendingCount > 0) {
    return "Consumption is normal. Some readings still need manual verification.";
  }

  return "Consumption and reading quality are within the normal monitoring range.";
}

/**
 * The whole profile for one building.
 *
 * `readings` may be the entire campus list: they are narrowed to this building's
 * meters here, and coverage is stamped before anything else so each reading keeps
 * the date of its meter's previous reading.
 */
export function buildBuildingProfile({
  building,
  meters = [],
  readings = [],
  appliances = [],
  rate = 0,
}) {
  const buildingId = Number(building?.building_id);
  const floorArea = Number(building?.floor_area || 0);

  const buildingMeters = meters.filter((meter) => Number(meter.building_id) === buildingId);
  const meterById = new Map(buildingMeters.map((meter) => [Number(meter.meter_id), meter]));

  const buildingReadings = annotateReadingCoverage(
    readings.filter((reading) => meterById.has(Number(reading.meter_id)))
  ).map((reading) => {
    const differential = getReadingDifferential(reading);

    return {
      ...reading,
      ocr_accuracy: getOcrScore(reading.ocr_accuracy),
      is_verified: Boolean(reading.is_verified),
      differential,
      cost: differential * rate,
      serial_no: meterById.get(Number(reading.meter_id))?.serial_no || `Meter #${reading.meter_id}`,
    };
  });

  // Newest first, the order a history table is read in.
  const readingHistory = [...buildingReadings].sort(
    (a, b) =>
      (toTime(b.reading_date) ?? 0) - (toTime(a.reading_date) ?? 0) ||
      Number(b.record_id) - Number(a.record_id)
  );

  const totalConsumption = buildingReadings.reduce((sum, reading) => sum + reading.differential, 0);
  const spanDays = getReadingSpanDays(buildingReadings);
  const isAnnualized = spanDays >= MIN_DAYS_TO_ANNUALIZE;
  const rawEui = computeEui(totalConsumption, floorArea);
  const status = getEnergyStatus(totalConsumption, floorArea, spanDays);
  const measuredKwhMonth = isAnnualized ? totalConsumption / (spanDays / DAYS_PER_MONTH) : null;

  const meterRows = buildingMeters
    .map((meter) => {
      const meterReadings = readingHistory.filter(
        (reading) => Number(reading.meter_id) === Number(meter.meter_id)
      );
      const consumption = meterReadings.reduce((sum, reading) => sum + reading.differential, 0);

      return {
        ...meter,
        readingCount: meterReadings.length,
        consumption,
        share: totalConsumption > 0 ? consumption / totalConsumption : 0,
        latest: meterReadings[0] || null,
      };
    })
    .sort((a, b) => String(a.serial_no).localeCompare(String(b.serial_no)));

  const applianceRows = appliances
    .filter((appliance) => Number(appliance.building_id) === buildingId)
    .map((appliance) => {
      const kwhMonth = applianceKwhMonth(appliance);

      return { ...appliance, kwhMonth, costMonth: kwhMonth * rate };
    })
    .sort((a, b) => b.kwhMonth - a.kwhMonth);
  const estimatedKwhMonth = applianceRows.reduce((sum, appliance) => sum + appliance.kwhMonth, 0);

  const monthly = buildMonthlyConsumption(buildingReadings, rate);
  const recordedMonths = monthly.filter((point) => !point.isGap);
  const peakMonth = recordedMonths.reduce(
    (peak, point) => (!peak || point.value > peak.value ? point : peak),
    null
  );

  const quality = {
    ocrCount: buildingReadings.filter((reading) => !isManualReading(reading)).length,
    manualCount: buildingReadings.filter(isManualReading).length,
    averageAccuracy: getAverageOcrAccuracy(buildingReadings),
    lowAccuracyCount: buildingReadings.filter(isLowOcrAccuracy).length,
    verifiedCount: buildingReadings.filter((reading) => reading.is_verified).length,
    pendingCount: buildingReadings.filter((reading) => !reading.is_verified).length,
  };

  return {
    meters: meterRows,
    readings: readingHistory,
    appliances: applianceRows,
    monthly,
    totals: {
      consumption: totalConsumption,
      cost: totalConsumption * rate,
      readingCount: buildingReadings.length,
      meterCount: buildingMeters.length,
      spanDays,
      isAnnualized,
      rawEui,
      eui: annualizeEui(rawEui, spanDays),
      status,
      firstReadingDate: readingHistory.at(-1)?.reading_date || null,
      latestReading: readingHistory[0] || null,
      measuredKwhMonth,
      estimatedKwhMonth,
      estimatedCostMonth: estimatedKwhMonth * rate,
      peakMonth,
      latestMonth: monthly.at(-1) || null,
      previousMonth: monthly.length > 1 ? monthly.at(-2) : null,
    },
    quality,
    applianceComparison: getApplianceComparison(
      measuredKwhMonth,
      estimatedKwhMonth,
      applianceRows.length > 0
    ),
    recommendation: getProfileRecommendation({
      status,
      floorArea,
      readingCount: buildingReadings.length,
      lowAccuracyCount: quality.lowAccuracyCount,
      pendingCount: quality.pendingCount,
    }),
  };
}
