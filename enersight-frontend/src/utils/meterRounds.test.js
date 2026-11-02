import { describe, expect, it } from "vitest";
import {
  buildMeterRounds,
  daysBetween,
  getMeterHistory,
  getMonthPeriod,
  getNextMeterToRead,
  getRecentMonths,
} from "./meterRounds";

const meters = [
  { meter_id: 1, serial_no: "DNSC-ADM-01" },
  { meter_id: 2, serial_no: "DNSC-IC-02" },
  { meter_id: 3, serial_no: "DNSC-LIB-03" },
  { meter_id: 4, serial_no: "DNSC-NEW-04" },
];

// Local-time dates, so the month boundaries hold in any time zone.
const at = (year, month, day) => new Date(year, month - 1, day, 8, 30).toISOString();

const readings = [
  { record_id: 1, meter_id: 1, reading_value: 11164, previous_reading: 10812, reading_date: at(2026, 9, 1) },
  { record_id: 2, meter_id: 1, reading_value: 11500, previous_reading: 11164, reading_date: at(2026, 10, 1) },
  { record_id: 3, meter_id: 2, reading_value: 20000, previous_reading: 19000, reading_date: at(2026, 9, 20) },
  { record_id: 4, meter_id: 2, reading_value: 20959, previous_reading: 20000, reading_date: at(2026, 11, 2) },
  { record_id: 5, meter_id: 3, reading_value: 640, previous_reading: 600, reading_date: at(2026, 9, 25) },
];

const now = new Date(2026, 10, 3, 9, 0);
const november = getMonthPeriod(2026, 10);

const ids = (entries) => entries.map((entry) => entry.meter.meter_id);

describe("getMonthPeriod / getRecentMonths", () => {
  it("covers the whole calendar month, end exclusive", () => {
    expect(november.key).toBe("2026-11");
    expect(november.label).toBe("November 2026");
    expect(november.start).toBe(new Date(2026, 10, 1).getTime());
    expect(november.end).toBe(new Date(2026, 11, 1).getTime());
  });

  it("lists months newest first across a year boundary", () => {
    const months = getRecentMonths(3, new Date(2027, 0, 15));
    expect(months.map((month) => month.key)).toEqual(["2027-01", "2026-12", "2026-11"]);
  });
});

describe("buildMeterRounds", () => {
  it("counts a meter as done only when it has a reading inside the period", () => {
    const { toRead, done } = buildMeterRounds(meters, readings, november, now);

    expect(ids(done)).toEqual([2]);
    expect(done[0].periodReading.record_id).toBe(4);
    expect(ids(toRead)).toContain(1);
    expect(ids(toRead)).toContain(3);
  });

  it("puts never-read meters first, then the longest-unread", () => {
    const { toRead } = buildMeterRounds(meters, readings, november, now);

    // Meter 4 has no readings; meter 3 was last read Sep 25, meter 1 on Oct 1.
    expect(ids(toRead)).toEqual([4, 3, 1]);
    expect(toRead[0].latest).toBeNull();
    expect(toRead[0].daysSinceLatest).toBeNull();
    expect(toRead[2].daysSinceLatest).toBe(33);
  });

  it("uses each meter's newest reading as its latest", () => {
    const { toRead } = buildMeterRounds(meters, readings, november, now);
    const adm = toRead.find((entry) => entry.meter.meter_id === 1);

    expect(adm.latest.record_id).toBe(2);
  });

  it("judges an earlier month by that month's readings", () => {
    const october = getMonthPeriod(2026, 9);
    const { done } = buildMeterRounds(meters, readings, october, now);

    expect(ids(done)).toEqual([1]);
  });
});

describe("getNextMeterToRead", () => {
  const toRead = buildMeterRounds(meters, readings, november, now).toRead;

  it("moves to the following meter in the list", () => {
    expect(getNextMeterToRead(toRead, 4)).toBe(3);
    expect(getNextMeterToRead(toRead, 3)).toBe(1);
  });

  it("wraps round to the start and never returns the current meter", () => {
    expect(getNextMeterToRead(toRead, 1)).toBe(4);
  });

  it("starts from the top when the current meter is already done", () => {
    expect(getNextMeterToRead(toRead, 2)).toBe(4);
  });

  it("returns null when no other meter is left", () => {
    expect(getNextMeterToRead(toRead.slice(0, 1), 4)).toBeNull();
    expect(getNextMeterToRead([], 1)).toBeNull();
  });
});

describe("getMeterHistory", () => {
  it("lists the meter's readings newest first with use per day", () => {
    const history = getMeterHistory(readings, 1);

    expect(history.map((row) => row.reading.record_id)).toEqual([2, 1]);
    expect(history[0].used).toBe(336);
    expect(history[0].days).toBe(30);
    expect(history[0].perDay).toBeCloseTo(11.2);
  });

  it("has no per-day figure for the meter's first reading", () => {
    const history = getMeterHistory(readings, 1);

    expect(history[1].used).toBe(352);
    expect(history[1].days).toBeNull();
    expect(history[1].perDay).toBeNull();
  });

  it("stops at the limit", () => {
    expect(getMeterHistory(readings, 1, 1)).toHaveLength(1);
  });
});

describe("daysBetween", () => {
  it("counts whole days and tolerates missing dates", () => {
    expect(daysBetween(at(2026, 10, 1), at(2026, 11, 1))).toBe(31);
    expect(daysBetween(null, at(2026, 11, 1))).toBeNull();
  });
});
