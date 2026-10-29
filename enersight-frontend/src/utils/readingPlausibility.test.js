import { describe, expect, it } from "vitest";
import {
  JUMP_FACTOR,
  checkReadingPlausibility,
  getLatestReading,
  getUsualDailyUse,
} from "./readingPlausibility";

// The campus Vision meter: 11,800 kWh on Sep 1, 11,830 on Sep 11 (3 kWh a day).
const visionHistory = [
  { record_id: 1, meter_id: 2, reading_value: 11800, reading_date: "2026-09-01T08:00:00Z" },
  { record_id: 2, meter_id: 2, reading_value: 11830, reading_date: "2026-09-11T08:00:00Z" },
  { record_id: 3, meter_id: 9, reading_value: 500, reading_date: "2026-09-20T08:00:00Z" },
];

const visionCheck = (value, extra = {}) =>
  checkReadingPlausibility({
    value,
    previousValue: 11830,
    previousDate: "2026-09-11T08:00:00Z",
    readingDate: "2026-09-21T08:00:00Z",
    usualDailyUse: 3,
    serialNo: "2SV2022578984 / 41326063",
    ...extra,
  });

const codes = (issues) => issues.map((issue) => issue.code);

describe("getUsualDailyUse", () => {
  it("averages the meter's own history per day", () => {
    expect(getUsualDailyUse(visionHistory, 2)).toBeCloseTo(3);
  });

  it("is null without enough history to judge by", () => {
    expect(getUsualDailyUse(visionHistory, 9)).toBeNull();
    expect(getUsualDailyUse([], 2)).toBeNull();
    expect(
      getUsualDailyUse(
        [
          { meter_id: 2, reading_value: 100, reading_date: "2026-09-01" },
          { meter_id: 2, reading_value: 130, reading_date: "2026-09-04" },
        ],
        2
      )
    ).toBeNull();
  });

  it("is null when the meter never moved", () => {
    expect(
      getUsualDailyUse(
        [
          { meter_id: 2, reading_value: 100, reading_date: "2026-09-01" },
          { meter_id: 2, reading_value: 100, reading_date: "2026-10-01" },
        ],
        2
      )
    ).toBeNull();
  });
});

describe("getLatestReading", () => {
  it("picks the latest date, then the highest record id, like the API", () => {
    expect(getLatestReading(visionHistory, 2).record_id).toBe(2);
    expect(
      getLatestReading(
        [
          { record_id: 4, meter_id: 1, reading_value: 10, reading_date: "2026-09-01" },
          { record_id: 7, meter_id: 1, reading_value: 12, reading_date: "2026-09-01" },
        ],
        1
      ).record_id
    ).toBe(7);
    expect(getLatestReading(visionHistory, 99)).toBeNull();
  });
});

describe("checkReadingPlausibility", () => {
  it("passes an ordinary next reading", () => {
    expect(visionCheck("11861")).toEqual([]);
    expect(visionCheck(11861)).toEqual([]);
  });

  it("catches the dropped leading digit from the real campus photo", () => {
    const issues = visionCheck("1847");

    expect(codes(issues)).toEqual(["lower"]);
    expect(issues[0].blocking).toBe(true);
  });

  it("catches an extra or misread leading digit as a jump", () => {
    expect(codes(visionCheck("71847"))).toEqual(["jump"]);
    expect(visionCheck("71847")[0].blocking).toBe(false);
  });

  it("allows normal variation up to the jump factor", () => {
    // 10 days at just under 3x the usual 3 kWh a day.
    expect(visionCheck(String(11830 + 10 * 3 * JUMP_FACTOR - 1))).toEqual([]);
  });

  it("does not divide by a near-zero gap for same-day readings", () => {
    expect(
      visionCheck("11835", { readingDate: "2026-09-11T09:00:00Z" })
    ).toEqual([]);
  });

  it("flags a reading that is part of the serial number", () => {
    expect(codes(visionCheck("41326063"))).toEqual(["jump", "serial"]);
    // The first reading of a meter has no history, but the serial still counts.
    expect(
      codes(
        visionCheck("41326063", { previousValue: 0, previousDate: null, usualDailyUse: null })
      )
    ).toEqual(["serial"]);
  });

  it("ignores short coincidental serial matches", () => {
    expect(
      codes(visionCheck("2022", { previousValue: 0, previousDate: null }))
    ).toEqual([]);
  });

  it("skips the jump check without usable history", () => {
    expect(visionCheck("71847", { usualDailyUse: null })).toEqual([]);
    expect(visionCheck("71847", { previousDate: null })).toEqual([]);
  });

  it("says nothing about an empty or non-numeric value", () => {
    expect(visionCheck("")).toEqual([]);
    expect(visionCheck(undefined)).toEqual([]);
    expect(visionCheck("abc")).toEqual([]);
  });
});
