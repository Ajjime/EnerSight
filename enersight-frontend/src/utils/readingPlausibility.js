// Checks a new reading against what its meter has done before.
//
// OCR confidence cannot catch the misreads that matter. On the campus Vision meter
// EasyOCR read 11847 as 1847 at 76% and the page called it a success; a confident
// 41326063 off the meter's nameplate came within ~10% of being chosen over the
// display. The meter's own history catches both: a meter only counts up, it uses
// roughly the same energy per day from one reading to the next, and its serial
// number is on record. Applies to typed-in readings too, where it catches typos.

const DAY_MS = 24 * 60 * 60 * 1000;

// How many times the meter's usual daily use counts as an unusual jump. Normal
// month-to-month swings stay well under this; an extra or misread leading digit
// is ten times or more.
export const JUMP_FACTOR = 3;

// A usual daily use worked out over less than this is too noisy to judge by.
export const MIN_HISTORY_DAYS = 7;

// Shorter digit strings match some serial number by coincidence too often.
export const MIN_SERIAL_MATCH_DIGITS = 5;

function timeOf(value) {
  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

function readingsForMeter(readings, meterId) {
  return (readings || []).filter(
    (reading) =>
      Number(reading.meter_id) === Number(meterId) &&
      timeOf(reading.reading_date) !== null
  );
}

/**
 * The meter's latest reading, picked the way GET /readings/meter/{id}/last picks it
 * (latest date, then highest record id), so it is the reading the form treats as
 * "previous". Null when the meter has none.
 */
export function getLatestReading(readings, meterId) {
  let latest = null;

  for (const reading of readingsForMeter(readings, meterId)) {
    if (
      !latest ||
      timeOf(reading.reading_date) > timeOf(latest.reading_date) ||
      (timeOf(reading.reading_date) === timeOf(latest.reading_date) &&
        Number(reading.record_id) > Number(latest.record_id))
    ) {
      latest = reading;
    }
  }

  return latest;
}

/**
 * The meter's usual kWh per day over its whole recorded history, or null when the
 * history is too short to say (fewer than two readings, under MIN_HISTORY_DAYS, or
 * no consumption at all).
 */
export function getUsualDailyUse(readings, meterId) {
  const own = readingsForMeter(readings, meterId);

  if (own.length < 2) {
    return null;
  }

  let first = own[0];
  let last = own[0];

  for (const reading of own) {
    if (timeOf(reading.reading_date) < timeOf(first.reading_date)) {
      first = reading;
    }

    if (timeOf(reading.reading_date) > timeOf(last.reading_date)) {
      last = reading;
    }
  }

  const days = (timeOf(last.reading_date) - timeOf(first.reading_date)) / DAY_MS;
  const used = Number(last.reading_value) - Number(first.reading_value);

  if (days < MIN_HISTORY_DAYS || !(used > 0)) {
    return null;
  }

  return used / days;
}

function formatKwh(value) {
  return Math.round(value).toLocaleString();
}

/**
 * Why a reading looks wrong for its meter, as [{ code, message, blocking }]; empty
 * when nothing stands out. `blocking` issues are the ones saving refuses anyway.
 *
 *   lower   below the previous reading (blocking)
 *   start   a first reading measured from a starting value of 0
 *   jump    implies far more use per day than this meter's usual
 *   serial  matches part of the meter's serial number
 *
 * `usualDailyUse` is in register units, like the readings; `multiplier` only
 * turns the figures in the message into kWh.
 */
export function checkReadingPlausibility({
  value,
  previousValue,
  previousDate,
  readingDate,
  usualDailyUse,
  serialNo,
  isFirstReading = false,
  multiplier = 1,
}) {
  const issues = [];
  const text = String(value ?? "").trim();
  const reading = Number(text);

  if (!text || !Number.isFinite(reading)) {
    return issues;
  }

  const previous = Number(previousValue) || 0;
  const toKwh = multiplier > 0 ? multiplier : 1;

  if (reading < previous) {
    issues.push({
      code: "lower",
      blocking: true,
      message:
        `Lower than the last reading (${previous.toLocaleString()}). A meter only ` +
        "counts up, so a digit was probably misread or left out.",
    });
  } else if (isFirstReading && previous === 0 && reading > 0) {
    // A meter already running when it was added shows its lifetime total, and a
    // starting value left at 0 would count all of it as used since then.
    issues.push({
      code: "start",
      blocking: false,
      message:
        `Starting from 0 counts all ${formatKwh(reading * toKwh)} kWh on this meter as ` +
        "used since it was added. If it was already running, enter the number it " +
        "showed then.",
    });
  } else if (usualDailyUse > 0 && timeOf(previousDate) !== null) {
    const readingTime = timeOf(readingDate) ?? Date.now();
    // At least a day, so a second reading on the same day is not divided by ~0.
    const days = Math.max(1, (readingTime - timeOf(previousDate)) / DAY_MS);
    const perDay = (reading - previous) / days;

    if (perDay > JUMP_FACTOR * usualDailyUse) {
      issues.push({
        code: "jump",
        blocking: false,
        message:
          `That is ${formatKwh(perDay * toKwh)} kWh a day since the last reading, more ` +
          `than ${JUMP_FACTOR}× this meter's usual ${formatKwh(usualDailyUse * toKwh)} kWh ` +
          "a day. Check for an extra or misread digit.",
      });
    }
  }

  const serialDigits = String(serialNo ?? "").replace(/\D/g, "");
  const readingDigits = text.replace(/\D/g, "");

  if (
    readingDigits.length >= MIN_SERIAL_MATCH_DIGITS &&
    serialDigits.includes(readingDigits)
  ) {
    issues.push({
      code: "serial",
      blocking: false,
      message:
        `Matches part of the meter's serial number (${serialNo}). OCR may have ` +
        "read the nameplate instead of the display.",
    });
  }

  return issues;
}
