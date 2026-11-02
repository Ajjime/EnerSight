// The monthly meter round behind the Add Meter Reading page: which meters still
// need a reading in a period, which are done, which one to read next, and a
// meter's recent history.
//
// Everything is worked out from the readings the page already loads, so the
// backend has no idea of a "round"; a meter counts as read in a month when it has
// at least one reading dated inside that month.

const DAY_MS = 24 * 60 * 60 * 1000;

function timeOf(value) {
  // new Date(null) is 1970, not "no date".
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

/** Later date first, then the higher record id, the way GET /readings/meter/{id}/last picks. */
function compareNewestFirst(a, b) {
  return (
    timeOf(b.reading_date) - timeOf(a.reading_date) ||
    Number(b.record_id) - Number(a.record_id)
  );
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Calendar month as { key: "2026-11", label: "November 2026", start, end } (end exclusive). */
export function getMonthPeriod(year, month) {
  const startDate = new Date(year, month, 1);

  return {
    key: monthKey(startDate.getFullYear(), startDate.getMonth()),
    label: startDate.toLocaleString("en-US", { month: "long", year: "numeric" }),
    start: startDate.getTime(),
    end: new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1).getTime(),
  };
}

/** The `count` most recent calendar months, the current one first. */
export function getRecentMonths(count = 6, now = new Date()) {
  const months = [];

  for (let offset = 0; offset < count; offset += 1) {
    months.push(getMonthPeriod(now.getFullYear(), now.getMonth() - offset));
  }

  return months;
}

/** Whole days from `from` to `to`, or null when either date is missing. */
export function daysBetween(from, to) {
  const start = timeOf(from);
  const end = timeOf(to);

  if (start === null || end === null) {
    return null;
  }

  return Math.floor((end - start) / DAY_MS);
}

/**
 * Splits the meters into the period's round:
 *
 *   toRead  no reading inside the period. Oldest last reading first, and meters
 *           that have never been read before all of them.
 *   done    at least one reading inside the period. Most recently read first.
 *
 * Each entry is { meter, latest, daysSinceLatest, periodReading }: `latest` is the
 * meter's newest reading overall, `periodReading` its newest inside the period.
 */
export function buildMeterRounds(meters, readings, period, now = new Date()) {
  const byMeter = new Map();

  for (const reading of readings || []) {
    if (timeOf(reading.reading_date) === null) {
      continue;
    }

    const key = Number(reading.meter_id);

    if (!byMeter.has(key)) {
      byMeter.set(key, []);
    }

    byMeter.get(key).push(reading);
  }

  const toRead = [];
  const done = [];

  for (const meter of meters || []) {
    const own = (byMeter.get(Number(meter.meter_id)) || []).sort(compareNewestFirst);
    const latest = own[0] || null;
    const periodReading =
      own.find((reading) => {
        const time = timeOf(reading.reading_date);
        return time >= period.start && time < period.end;
      }) || null;

    const entry = {
      meter,
      latest,
      daysSinceLatest: latest ? daysBetween(latest.reading_date, now) : null,
      periodReading,
    };

    (periodReading ? done : toRead).push(entry);
  }

  toRead.sort((a, b) => {
    if (!a.latest || !b.latest) {
      return (a.latest ? 1 : 0) - (b.latest ? 1 : 0);
    }

    return timeOf(a.latest.reading_date) - timeOf(b.latest.reading_date);
  });

  done.sort((a, b) => compareNewestFirst(a.periodReading, b.periodReading));

  return { toRead, done };
}

/**
 * The meter to read after `currentMeterId`: the next one in the to-read list,
 * wrapping round to the start, never the current meter itself. Null when no other
 * meter is left to read.
 */
export function getNextMeterToRead(toRead, currentMeterId) {
  const ids = (toRead || []).map((entry) => Number(entry.meter.meter_id));
  const index = ids.indexOf(Number(currentMeterId));
  const ordered = index === -1 ? ids : [...ids.slice(index + 1), ...ids.slice(0, index)];

  return ordered.length > 0 ? ordered[0] : null;
}

/**
 * A meter's latest `limit` readings, newest first, each as
 * { reading, used, days, perDay }. `used` is (reading_value - previous_reading) ×
 * the meter's `multiplier`, in kWh; `days` and `perDay` run from the meter's
 * reading before it, and are null for its first reading (whose previous value was
 * typed in, with no date).
 */
export function getMeterHistory(readings, meterId, limit = 5, multiplier = 1) {
  const own = (readings || [])
    .filter(
      (reading) =>
        Number(reading.meter_id) === Number(meterId) &&
        timeOf(reading.reading_date) !== null
    )
    .sort(compareNewestFirst);

  return own.slice(0, limit).map((reading, index) => {
    const before = own[index + 1] || null;
    const used =
      Math.max(Number(reading.reading_value) - Number(reading.previous_reading || 0), 0) *
      (multiplier > 0 ? multiplier : 1);
    const days = before ? daysBetween(before.reading_date, reading.reading_date) : null;

    return {
      reading,
      used,
      days,
      // At least a day, so two readings on the same day are not divided by zero.
      perDay: days === null ? null : used / Math.max(days, 1),
    };
  });
}
