import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STALE_METER_DAYS,
  buildCalendarMonths,
  getMeterMultiplier,
  prepareReadings,
  sumKwh,
} from "./consumption";
import { getReadingSpanDays } from "./energyStatus";

const reading = (record_id, meter_id, previous_reading, reading_value, reading_date) => ({
  record_id,
  meter_id,
  previous_reading,
  reading_value,
  reading_date,
});

describe("getMeterMultiplier", () => {
  it("is the meter's multiplier, or 1 when missing or not positive", () => {
    expect(getMeterMultiplier({ multiplier: 40 })).toBe(40);
    expect(getMeterMultiplier({ multiplier: 0.1 })).toBe(0.1);
    expect(getMeterMultiplier({ multiplier: null })).toBe(1);
    expect(getMeterMultiplier({ multiplier: 0 })).toBe(1);
    expect(getMeterMultiplier(undefined)).toBe(1);
  });
});

describe("prepareReadings", () => {
  const meters = [{ meter_id: 1, created_at: "2026-01-01T00:00:00Z" }];

  it("measures a first reading from when its meter was added", () => {
    const [first, second] = prepareReadings(
      [
        reading(1, 1, 1000, 1300, "2026-01-31T00:00:00Z"),
        reading(2, 1, 1300, 1600, "2026-03-02T00:00:00Z"),
      ],
      meters
    );

    expect(first.covers_from).toBe("2026-01-01T00:00:00Z");
    expect(first.differential).toBe(300);
    expect(first.is_baseline).toBe(false);
    expect(second.covers_from).toBe("2026-01-31T00:00:00Z");
  });

  it("makes a first reading older than its meter the starting point", () => {
    // The validation case: a running meter added with a starting value of 0. Its
    // whole register (11,847) used to count as one period's use.
    const [first, second] = prepareReadings(
      [
        reading(1, 1, 0, 11847, "2025-09-01T02:00:00Z"),
        reading(2, 1, 11847, 12247, "2025-10-02T02:00:00Z"),
      ],
      meters
    );

    expect(first.is_baseline).toBe(true);
    expect(first.covers_from).toBeNull();
    expect(first.differential).toBe(0);
    expect(sumKwh([first, second])).toBe(400);
    expect(getReadingSpanDays([first, second])).toBeCloseTo(31, 0);
  });

  it("treats a first reading as the starting point when the meter has no added date", () => {
    const [first] = prepareReadings([reading(1, 1, 0, 500, "2026-02-01T00:00:00Z")], [{ meter_id: 1 }]);

    expect(first.is_baseline).toBe(true);
    expect(first.differential).toBe(0);
  });

  it("applies the meter's multiplier and never goes negative", () => {
    const [first, second] = prepareReadings(
      [
        reading(1, 1, 100, 110, "2026-02-01T00:00:00Z"),
        reading(2, 1, 110, 105, "2026-03-01T00:00:00Z"),
      ],
      [{ ...meters[0], multiplier: 40 }]
    );

    expect(first.differential).toBe(400);
    expect(second.differential).toBe(0);
  });

  it("flags sub-meter readings, which no total counts", () => {
    const prepared = prepareReadings(
      [
        reading(1, 1, 0, 1000, "2026-02-01T00:00:00Z"),
        reading(2, 2, 0, 300, "2026-02-01T00:00:00Z"),
      ],
      [meters[0], { meter_id: 2, created_at: "2026-01-01T00:00:00Z", is_submeter: true }]
    );

    expect(prepared[1].is_submeter).toBe(true);
    expect(prepared[1].differential).toBe(300);
    // The validation case: a main meter at 1,000 kWh and a sub-meter after it at
    // 300 used to add up to 1,300.
    expect(sumKwh(prepared)).toBe(1000);
  });

  it("keeps the input order and copies the readings", () => {
    const input = [reading(2, 1, 1300, 1600, "2026-03-02T00:00:00Z"), reading(1, 1, 1000, 1300, "2026-01-31T00:00:00Z")];
    const prepared = prepareReadings(input, meters);

    expect(prepared.map((item) => item.record_id)).toEqual([2, 1]);
    expect(input[0]).not.toHaveProperty("differential");
  });
});

describe("getReadingSpanDays with sub-meters", () => {
  it("leaves sub-meter readings out of the span", () => {
    expect(
      getReadingSpanDays([
        { reading_date: "2026-03-01T00:00:00Z", covers_from: "2026-02-01T00:00:00Z" },
        { reading_date: "2026-05-01T00:00:00Z", covers_from: "2026-01-01T00:00:00Z", is_submeter: true },
      ])
    ).toBe(28);
  });
});

describe("buildCalendarMonths", () => {
  // Local dates: months are the viewer's calendar months.
  const addedJan1 = [{ meter_id: 1, created_at: "2026-01-01T00:00:00" }];

  it("spreads each reading's kWh over the days it covers", () => {
    // 620 kWh from Jan 16 to Feb 16 (31 days): 16 days in January, 15 in February.
    // Another 620 from Feb 16 to Mar 19: 13 of its 31 days in February.
    const months = buildCalendarMonths(
      prepareReadings(
        [
          reading(1, 1, 0, 0, "2026-01-16T00:00:00"),
          reading(2, 1, 0, 620, "2026-02-16T00:00:00"),
          reading(3, 1, 620, 1240, "2026-03-19T00:00:00"),
        ],
        [{ meter_id: 1, created_at: "2026-02-01T00:00:00" }]
      )
    );

    // January starts partway through and March is not over: only February.
    expect(months.map((point) => point.sortKey)).toEqual(["2026-02"]);
    expect(months[0].value).toBeCloseTo(620 * (15 / 31) + 620 * (13 / 31));
  });

  it("has no zero month when a reading is skipped", () => {
    // The validation case: steady use, one month's reading missed.
    const months = buildCalendarMonths(
      prepareReadings(
        [
          reading(1, 1, 0, 310, "2026-02-01T00:00:00"),
          reading(2, 1, 310, 900, "2026-04-01T00:00:00"),
        ],
        addedJan1
      )
    );

    expect(months.map((point) => Math.round(point.value))).toEqual([310, 280, 310]);
  });

  it("waits for every meter on the rounds before closing a month", () => {
    const prepared = prepareReadings(
      [
        reading(1, 1, 0, 310, "2026-02-01T00:00:00"),
        reading(2, 1, 310, 590, "2026-03-01T00:00:00"),
        reading(3, 2, 0, 31, "2026-02-01T00:00:00"),
      ],
      [...addedJan1, { meter_id: 2, created_at: "2026-01-01T00:00:00" }]
    );

    // Meter 2 has not been read past February 1, so February is not known yet.
    expect(buildCalendarMonths(prepared).map((point) => point.sortKey)).toEqual(["2026-01"]);
    expect(buildCalendarMonths(prepared)[0].value).toBeCloseTo(341);
  });

  it(`does not wait for a meter last read over ${STALE_METER_DAYS} days before the newest reading`, () => {
    const prepared = prepareReadings(
      [
        reading(1, 1, 0, 310, "2026-02-01T00:00:00"),
        reading(2, 1, 310, 590, "2026-03-01T00:00:00"),
        reading(3, 1, 590, 900, "2026-04-01T00:00:00"),
        reading(4, 2, 0, 31, "2026-02-01T00:00:00"),
      ],
      [...addedJan1, { meter_id: 2, created_at: "2026-01-01T00:00:00" }]
    );

    expect(buildCalendarMonths(prepared).map((point) => point.sortKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("leaves sub-meters out and counts the readings taken in each month", () => {
    const months = buildCalendarMonths(
      prepareReadings(
        [
          reading(1, 1, 0, 310, "2026-02-01T00:00:00"),
          reading(2, 2, 0, 100, "2026-02-01T00:00:00"),
          reading(3, 1, 310, 590, "2026-03-01T00:00:00"),
        ],
        [...addedJan1, { meter_id: 2, created_at: "2026-01-01T00:00:00", is_submeter: true }]
      )
    );

    expect(months.map((point) => Math.round(point.value))).toEqual([310, 280]);
    expect(months.map((point) => point.readingCount)).toEqual([0, 2]);
  });

  it("is empty with nothing that covers a whole month", () => {
    expect(buildCalendarMonths([])).toEqual([]);
    expect(
      buildCalendarMonths(prepareReadings([reading(1, 1, 0, 50, "2026-02-01T00:00:00")], []))
    ).toEqual([]);
  });
});

describe("backend parity", () => {
  const backendFile = (path) =>
    readFileSync(new URL(`../../../enersight-backend/${path}`, import.meta.url), "utf8");

  it("evaluate_forecast.py waits for the same meters", () => {
    const script = backendFile("evaluate_forecast.py");

    expect(Number(script.match(/^STALE_METER_DAYS\s*=\s*(\d+)/m)?.[1])).toBe(STALE_METER_DAYS);
  });

  it("routes/map.py applies the same three rules", () => {
    const mapPy = backendFile("app/routes/map.py");

    expect(mapPy).toMatch(/meter\.multiplier/);
    expect(mapPy).toMatch(/if meter\.is_submeter:\s*\n\s*continue/);
    expect(mapPy).toMatch(/meter\.created_at < reading\.reading_date/);
  });
});
