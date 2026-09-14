import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENERGY_STATUS_OPTIONS,
  EUI_CRITICAL_THRESHOLD,
  EUI_HIGH_THRESHOLD,
  MIN_DAYS_TO_ANNUALIZE,
  annotateReadingCoverage,
  annualizeEui,
  computeEui,
  getEnergyStatus,
  getReadingSpanDays,
} from "./energyStatus";

function coversById(readings) {
  return Object.fromEntries(
    annotateReadingCoverage(readings).map((reading) => [
      reading.record_id,
      reading.covers_from,
    ])
  );
}

describe("computeEui", () => {
  it("is kWh per square metre", () => {
    expect(computeEui(1000, 100)).toBe(10);
    expect(computeEui("1500", "100")).toBe(15);
  });

  it("is 0 without consumption or floor area", () => {
    expect(computeEui(0, 100)).toBe(0);
    expect(computeEui(null, 100)).toBe(0);
    expect(computeEui(-5, 100)).toBe(0);
    expect(computeEui(1000, 0)).toBe(0);
  });
});

describe("annualizeEui", () => {
  it("scales an intensity to a full year", () => {
    expect(annualizeEui(10, 365)).toBe(10);
    expect(annualizeEui(2, 20)).toBeCloseTo(36.5);
  });

  it("leaves spans shorter than the minimum unscaled", () => {
    expect(MIN_DAYS_TO_ANNUALIZE).toBe(20);
    expect(annualizeEui(2, 19)).toBe(2);
    expect(annualizeEui(2, null)).toBe(2);
  });

  it("is 0 for no usage", () => {
    expect(annualizeEui(0, 365)).toBe(0);
    expect(annualizeEui(-1, 365)).toBe(0);
    expect(annualizeEui(NaN, 365)).toBe(0);
  });
});

describe("getEnergyStatus", () => {
  it("offers the four statuses the pages filter by", () => {
    expect(ENERGY_STATUS_OPTIONS).toEqual(["Normal", "High", "Critical", "No Data"]);
  });

  it("cannot grade without consumption or floor area", () => {
    expect(getEnergyStatus(0, 1000)).toBe("No Data");
    expect(getEnergyStatus(5000, 0)).toBe("No Data");
  });

  it("uses strict thresholds: above 10 is High, above 20 is Critical", () => {
    expect(EUI_HIGH_THRESHOLD).toBe(10);
    expect(EUI_CRITICAL_THRESHOLD).toBe(20);
    expect(getEnergyStatus(1000, 100)).toBe("Normal");
    expect(getEnergyStatus(1001, 100)).toBe("High");
    expect(getEnergyStatus(2000, 100)).toBe("High");
    expect(getEnergyStatus(2001, 100)).toBe("Critical");
  });

  it("grades a month and a year of the same usage the same way", () => {
    // 2,650 kWh a month in a 1,450 m² lab is about 22 kWh/m² a year.
    expect(getEnergyStatus(2650, 1450, 30)).toBe("Critical");
    expect(getEnergyStatus(2650 * 12, 1450, 365)).toBe("Critical");
    // Unannualised, one month looks like a tenth of that.
    expect(getEnergyStatus(2650, 1450)).toBe("Normal");
  });
});

describe("annotateReadingCoverage", () => {
  it("links each reading to the same meter's previous reading, whatever the order", () => {
    const byId = coversById([
      { record_id: 3, meter_id: 1, reading_date: "2026-08-02T10:00:00Z" },
      { record_id: 9, meter_id: 2, reading_date: "2026-08-05T10:00:00Z" },
      { record_id: 2, meter_id: 1, reading_date: "2026-07-03T10:00:00Z" },
      { record_id: 1, meter_id: 1, reading_date: "2026-06-01T10:00:00Z" },
    ]);

    expect(byId[1]).toBeNull();
    expect(byId[2]).toBe("2026-06-01T10:00:00Z");
    expect(byId[3]).toBe("2026-07-03T10:00:00Z");
    expect(byId[9]).toBeNull();
  });

  it("breaks same-time ties by record id", () => {
    const byId = coversById([
      { record_id: 5, meter_id: 1, reading_date: "2026-07-01T08:00:00Z" },
      { record_id: 4, meter_id: 1, reading_date: "2026-07-01T08:00:00.000Z" },
    ]);

    expect(byId[4]).toBeNull();
    expect(byId[5]).toBe("2026-07-01T08:00:00.000Z");
  });

  it("skips undated readings", () => {
    const byId = coversById([
      { record_id: 1, meter_id: 1, reading_date: "2026-06-01" },
      { record_id: 2, meter_id: 1, reading_date: "" },
      { record_id: 3, meter_id: 1, reading_date: "2026-07-01" },
    ]);

    expect(byId[2]).toBeNull();
    expect(byId[3]).toBe("2026-06-01");
  });

  it("keeps the input order and leaves the originals untouched", () => {
    const readings = [
      { record_id: 2, meter_id: 1, reading_date: "2026-07-01" },
      { record_id: 1, meter_id: 1, reading_date: "2026-06-01" },
    ];
    const annotated = annotateReadingCoverage(readings);

    expect(annotated.map((reading) => reading.record_id)).toEqual([2, 1]);
    expect(annotated[0]).not.toBe(readings[0]);
    expect(readings[0]).not.toHaveProperty("covers_from");
  });

  it("returns an empty list for anything but an array", () => {
    expect(annotateReadingCoverage(null)).toEqual([]);
  });
});

describe("getReadingSpanDays", () => {
  it("is 0 with nothing to measure", () => {
    expect(getReadingSpanDays([])).toBe(0);
    expect(getReadingSpanDays(null)).toBe(0);
    expect(getReadingSpanDays([{ reading_date: "2026-08-02T10:00:00Z" }])).toBe(0);
  });

  it("counts the days a single reading covers", () => {
    expect(
      getReadingSpanDays([
        { reading_date: "2026-08-02T10:00:00Z", covers_from: "2026-07-03T10:00:00Z" },
      ])
    ).toBe(30);
  });

  it("runs from the earliest covered day to the latest reading", () => {
    expect(
      getReadingSpanDays([
        { reading_date: "2026-08-02T10:00:00Z", covers_from: "2026-07-03T10:00:00Z" },
        { reading_date: "2026-08-05T10:00:00Z", covers_from: "2026-07-06T10:00:00Z" },
      ])
    ).toBe(33);
  });

  it("falls back to first-to-last reading without coverage", () => {
    expect(
      getReadingSpanDays([
        { reading_date: "2026-06-01T00:00:00Z" },
        { reading_date: "2026-07-01T00:00:00Z" },
      ])
    ).toBe(30);
  });

  it("ignores bad dates", () => {
    expect(
      getReadingSpanDays([
        { reading_date: "" },
        { reading_date: "2026-08-02T10:00:00Z", covers_from: "not a date" },
      ])
    ).toBe(0);
  });

  it("fixes Last Month grading every building Normal", () => {
    const all = annotateReadingCoverage([
      { record_id: 1, meter_id: 1, reading_date: "2026-07-03T10:00:00Z", differential: 2800 },
      { record_id: 2, meter_id: 1, reading_date: "2026-08-02T10:00:00Z", differential: 2650 },
    ]);
    const august = all.filter((reading) => reading.reading_date.startsWith("2026-08"));
    const total = august.reduce((sum, reading) => sum + reading.differential, 0);
    const withoutCoverage = august.map((reading) => ({ ...reading, covers_from: null }));

    expect(getEnergyStatus(total, 1450, getReadingSpanDays(august))).toBe("Critical");
    // The old behaviour: one reading spanned zero days and was never annualised.
    expect(getEnergyStatus(total, 1450, getReadingSpanDays(withoutCoverage))).toBe("Normal");
  });
});

describe("backend parity", () => {
  // routes/map.py grades the GIS map on the server. If its thresholds drift from
  // these, the map and the other pages disagree about the same building.
  const mapPy = readFileSync(
    new URL("../../../enersight-backend/app/routes/map.py", import.meta.url),
    "utf8"
  );
  const pythonConstant = (name) =>
    Number(mapPy.match(new RegExp(`^${name}\\s*=\\s*([\\d.]+)`, "m"))?.[1]);

  it("uses the same thresholds and annualisation floor as routes/map.py", () => {
    expect(pythonConstant("EUI_CRITICAL_THRESHOLD")).toBe(EUI_CRITICAL_THRESHOLD);
    expect(pythonConstant("EUI_HIGH_THRESHOLD")).toBe(EUI_HIGH_THRESHOLD);
    expect(pythonConstant("MIN_DAYS_TO_ANNUALIZE")).toBe(MIN_DAYS_TO_ANNUALIZE);
  });
});
