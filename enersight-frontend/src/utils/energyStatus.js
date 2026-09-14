// The single definition of a building's energy status.
//
// Four different rules used to live in four files. Dashboard and BuildingMap keyed
// off energy-use intensity, while Analytics and Reports keyed off raw kWh, and
// Reports called the healthy band "Ready" where everything else said "Normal". The
// same building could be Critical on one page and Normal on another.
//
// Intensity (kWh per square metre per year) is the right basis. Raw kWh only ranks
// buildings by size, so a large warehouse always looks worse than an inefficient
// small office. And an un-annualised intensity grows forever as history
// accumulates, which means every building eventually turns Critical just by
// existing longer.
//
// The thresholds below are the project's own operating bands, not a published
// standard. State them that way if asked, and cite a reference (ASHRAE 100, or the
// Philippine Energy Efficiency Project benchmarks) if you later adopt one.

export const EUI_CRITICAL_THRESHOLD = 20;
export const EUI_HIGH_THRESHOLD = 10;

// Below this many days an extrapolation to a full year is noise, not a signal.
//
// It was 28. Readings are taken on different days of the month, so one monthly
// interval runs anywhere from about 25 to 34 days, and a 28-day floor left some
// single-month periods un-annualised: a month's intensity was then judged against
// yearly thresholds and always read Normal. Mirrored in routes/map.py.
export const MIN_DAYS_TO_ANNUALIZE = 20;
const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 86400000;

export const ENERGY_STATUS_OPTIONS = ["Normal", "High", "Critical", "No Data"];

export function computeEui(totalKwh, floorArea) {
  const consumption = Number(totalKwh || 0);
  const area = Number(floorArea || 0);

  if (consumption <= 0 || area <= 0) {
    return 0;
  }

  return consumption / area;
}

/**
 * Scales an intensity measured over `spanDays` to a yearly rate, so the thresholds
 * mean the same thing whether the page is showing three months or three years.
 */
export function annualizeEui(eui, spanDays) {
  const days = Number(spanDays || 0);

  if (!Number.isFinite(eui) || eui <= 0) {
    return 0;
  }

  if (days < MIN_DAYS_TO_ANNUALIZE) {
    return eui;
  }

  return eui * (DAYS_PER_YEAR / days);
}

/**
 * Stamps each reading with `covers_from`: the date of the same meter's previous
 * reading. A reading's differential is the energy used between those two dates, so
 * that is the stretch of time its kWh actually belongs to.
 *
 * Call this on the full reading list, before any period filter. Filtering first
 * drops the previous reading and loses the window.
 */
export function annotateReadingCoverage(readings) {
  if (!Array.isArray(readings)) {
    return [];
  }

  const byMeter = new Map();

  readings.forEach((reading) => {
    const key = String(reading.meter_id);

    if (!byMeter.has(key)) {
      byMeter.set(key, []);
    }

    byMeter.get(key).push(reading);
  });

  const coversFrom = new Map();

  byMeter.forEach((meterReadings) => {
    const dated = meterReadings
      .map((reading) => ({
        reading,
        time: new Date(reading.reading_date).getTime(),
      }))
      .filter((entry) => Number.isFinite(entry.time))
      .sort(
        (a, b) =>
          a.time - b.time ||
          Number(a.reading.record_id) - Number(b.reading.record_id)
      );

    dated.forEach((entry, index) => {
      coversFrom.set(
        entry.reading,
        index > 0 ? dated[index - 1].reading.reading_date : null
      );
    });
  });

  return readings.map((reading) => ({
    ...reading,
    covers_from: coversFrom.get(reading) ?? null,
  }));
}

/**
 * Days covered by a set of readings. Pass the result as `spanDays` to annualise.
 *
 * Measured from the earliest `covers_from` (see annotateReadingCoverage) to the
 * latest reading date. This used to run from the first reading to the last, so a
 * period holding one reading per meter (any single month) covered zero days, was
 * never annualised, and every building in it read Normal. Readings without
 * `covers_from` fall back to their own date, which is the old measure.
 *
 * Uses a loop rather than Math.max(...array), which blows the call stack once a
 * building has tens of thousands of readings.
 */
export function getReadingSpanDays(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    return 0;
  }

  let earliest = Infinity;
  let latest = -Infinity;

  for (const reading of readings) {
    const time = new Date(reading.reading_date).getTime();

    if (!Number.isFinite(time)) {
      continue;
    }

    const coveredFrom = reading.covers_from
      ? new Date(reading.covers_from).getTime()
      : time;
    const start = Number.isFinite(coveredFrom) ? coveredFrom : time;

    if (start < earliest) earliest = start;
    if (time > latest) latest = time;
  }

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return 0;
  }

  const span = (latest - earliest) / MS_PER_DAY;

  return span > 0 ? span : 0;
}

/**
 * The one status rule. Pass `spanDays` to judge an annualised rate; omit it to
 * judge the raw cumulative intensity.
 */
export function getEnergyStatus(totalKwh, floorArea, spanDays = null) {
  const consumption = Number(totalKwh || 0);
  const area = Number(floorArea || 0);

  // Without a floor area there is no intensity to judge, and without consumption
  // there is nothing to judge at all.
  if (consumption <= 0 || area <= 0) {
    return "No Data";
  }

  const rawEui = computeEui(consumption, area);
  const eui = spanDays === null ? rawEui : annualizeEui(rawEui, spanDays);

  if (eui > EUI_CRITICAL_THRESHOLD) {
    return "Critical";
  }

  if (eui > EUI_HIGH_THRESHOLD) {
    return "High";
  }

  return "Normal";
}
