// How a meter reading becomes kWh, in one place.
//
// Dashboard, Analytics, Reports, the Building Profile and Add Meter Reading each
// used to work out present − previous for themselves. Three rules now apply to all
// of them, and to routes/map.py on the server (change both together):
//
// 1. Multiplier. kWh = (present − previous) × the meter's multiplier: 40 for a
//    meter on 200:5 current transformers, 0.1 when the display's last digit is
//    tenths, 1 for a display that already shows kWh.
// 2. Sub-meters. A meter wired after another meter of the same building measures
//    energy that meter already counted. It keeps its own kWh for the breakdown but
//    is left out of every total (sumKwh, getReadingSpanDays, the monthly series).
//    Adding it in counted the same electricity twice.
// 3. The first reading. Each reading covers the days since the meter's previous
//    reading. A meter's first reading covers the days since the meter was added,
//    when it was added before that reading, because the starting value was
//    entered then. Otherwise nothing says when its starting value was read, so the
//    reading is the meter's starting point and adds 0 kWh. Counting it anyway put
//    kWh in the total with no days to spread them over: a starting value left at
//    0 turned a meter's whole lifetime register into one period's use.

import { annotateReadingCoverage } from "./energyStatus";
import { MONTH_LABELS } from "./forecast";

const DAY_MS = 86400000;

// A meter whose latest reading is this much older than the newest one is taken to
// be off the rounds (replaced, or not read lately) and does not hold the monthly
// series back. Mirrored in evaluate_forecast.py.
export const STALE_METER_DAYS = 45;

function timeOf(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

/** kWh per unit the register advances. Missing or not positive reads as 1. */
export function getMeterMultiplier(meter) {
  const multiplier = Number(meter?.multiplier);

  return multiplier > 0 ? multiplier : 1;
}

export function isSubMeter(meter) {
  return Boolean(meter?.is_submeter);
}

/**
 * Readings ready to add up, as copies carrying:
 *
 *   covers_from   when the reading's kWh start (rule 3), or null
 *   differential  kWh: (present − previous) × multiplier, never negative, and 0
 *                 for a meter's starting point
 *   is_baseline   true for that starting point
 *   is_submeter   from its meter; such readings count toward no total
 *
 * Pass the full list, before any period filter: each reading's window comes from
 * the reading before it. `meters` should hold every meter the readings belong to.
 * A reading whose meter is missing counts at ×1, and its first one is a starting
 * point.
 */
export function prepareReadings(readings, meters = []) {
  const meterById = new Map(
    (meters || []).map((meter) => [Number(meter.meter_id), meter])
  );

  return annotateReadingCoverage(readings).map((reading) => {
    const meter = meterById.get(Number(reading.meter_id));
    const registerDelta = Math.max(
      Number(reading.reading_value || 0) - Number(reading.previous_reading ?? 0),
      0
    );
    let coversFrom = reading.covers_from;
    let isBaseline = false;

    if (coversFrom === null) {
      const addedAt = timeOf(meter?.created_at);
      const readAt = timeOf(reading.reading_date);

      if (addedAt !== null && readAt !== null && addedAt < readAt) {
        coversFrom = meter.created_at;
      } else {
        isBaseline = true;
      }
    }

    return {
      ...reading,
      covers_from: coversFrom,
      differential: isBaseline ? 0 : registerDelta * getMeterMultiplier(meter),
      is_baseline: isBaseline,
      is_submeter: isSubMeter(meter),
    };
  });
}

/** True for a reading that adds to its building's and the campus total. */
export function countsTowardTotal(reading) {
  return !reading?.is_submeter;
}

/** Measured kWh of prepared readings, sub-meters left out. */
export function sumKwh(readings) {
  let total = 0;

  for (const reading of readings || []) {
    if (countsTowardTotal(reading)) {
      total += Number(reading.differential || 0);
    }
  }

  return total;
}

function monthKeyOf(time) {
  const date = new Date(time);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthStart(time) {
  const date = new Date(time);

  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
}

function isMonthStart(time) {
  const date = new Date(time);

  return new Date(date.getFullYear(), date.getMonth(), 1).getTime() === time;
}

function monthLabel(time) {
  const date = new Date(time);

  return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Measured kWh per calendar month, oldest first, as
 * [{ sortKey, month, value, readingCount }], from prepared readings.
 *
 * Each reading's kWh is spread evenly over the days it covers (covers_from to its
 * date), the way ENERGY STAR Portfolio Manager calendarises utility bills. Putting
 * a reading's kWh in the month it was taken instead mostly reported the month
 * before, made months swing with the 25 to 34 days between readings, and turned a
 * skipped reading into a month of 0 followed by a double one. On a steady 300 kWh
 * a month, that last one alone took the forecast error from 0% to about 50%.
 *
 * Only months covered from their first day to their last are returned. The first
 * month starts partway through, and the newest is not over until every meter on
 * the rounds has been read past its end (see STALE_METER_DAYS). A part-month would
 * read as a sudden drop. `readingCount` is the readings taken in the month.
 */
export function buildCalendarMonths(readings) {
  const dated = (readings || []).filter(
    (reading) => timeOf(reading.reading_date) !== null
  );
  const counted = dated.filter(countsTowardTotal);

  // The series ends where every meter still on the rounds has been read up to.
  const latestByMeter = new Map();

  for (const reading of counted) {
    const key = String(reading.meter_id);
    const time = timeOf(reading.reading_date);

    if (!latestByMeter.has(key) || time > latestByMeter.get(key)) {
      latestByMeter.set(key, time);
    }
  }

  if (latestByMeter.size === 0) {
    return [];
  }

  const newest = Math.max(...latestByMeter.values());
  let coverageEnd = newest;

  for (const time of latestByMeter.values()) {
    if (newest - time <= STALE_METER_DAYS * DAY_MS && time < coverageEnd) {
      coverageEnd = time;
    }
  }

  let coverageStart = Infinity;
  const totals = new Map();

  for (const reading of counted) {
    const start = timeOf(reading.covers_from);
    const end = timeOf(reading.reading_date);

    // A starting point: no kWh and no days.
    if (start === null) {
      continue;
    }

    coverageStart = Math.min(coverageStart, start);

    const kwh = Number(reading.differential || 0);

    if (!(kwh > 0)) {
      continue;
    }

    if (end <= start) {
      totals.set(monthKeyOf(end), (totals.get(monthKeyOf(end)) || 0) + kwh);
      continue;
    }

    for (let cursor = start; cursor < end; ) {
      const boundary = Math.min(nextMonthStart(cursor), end);
      const key = monthKeyOf(cursor);

      totals.set(key, (totals.get(key) || 0) + (kwh * (boundary - cursor)) / (end - start));
      cursor = boundary;
    }
  }

  if (!Number.isFinite(coverageStart)) {
    return [];
  }

  const readingCounts = new Map();

  for (const reading of dated) {
    const key = monthKeyOf(timeOf(reading.reading_date));
    readingCounts.set(key, (readingCounts.get(key) || 0) + 1);
  }

  const points = [];
  let month = isMonthStart(coverageStart) ? coverageStart : nextMonthStart(coverageStart);

  while (nextMonthStart(month) <= coverageEnd) {
    const sortKey = monthKeyOf(month);

    points.push({
      sortKey,
      month: monthLabel(month),
      value: totals.get(sortKey) || 0,
      readingCount: readingCounts.get(sortKey) || 0,
    });

    month = nextMonthStart(month);
  }

  return points;
}
