import { describe, expect, it } from "vitest";
import {
  buildBuildingProfile,
  buildMonthlyConsumption,
  getApplianceComparison,
  getReadingDifferential,
} from "./buildingProfile";
import { getEnergyStatus } from "./energyStatus";

const building = { building_id: 1, name: "Admin", floor_area: 100 };

const meters = [
  { meter_id: 10, building_id: 1, serial_no: "B-200" },
  { meter_id: 11, building_id: 1, serial_no: "A-100" },
  { meter_id: 99, building_id: 2, serial_no: "OTHER" },
];

const readings = [
  { record_id: 1, meter_id: 10, previous_reading: 0, reading_value: 1000, reading_date: "2026-01-15T08:00:00", ocr_accuracy: null, is_verified: true },
  { record_id: 2, meter_id: 10, previous_reading: 1000, reading_value: 1600, reading_date: "2026-02-15T08:00:00", ocr_accuracy: 95, is_verified: true },
  { record_id: 3, meter_id: 10, previous_reading: 1600, reading_value: 2000, reading_date: "2026-04-15T08:00:00", ocr_accuracy: 80, is_verified: false },
  { record_id: 4, meter_id: 11, previous_reading: 500, reading_value: 700, reading_date: "2026-02-20T08:00:00", ocr_accuracy: 0, is_verified: false },
  // Another building's meter: must not leak into this profile.
  { record_id: 5, meter_id: 99, previous_reading: 0, reading_value: 99999, reading_date: "2026-03-01T08:00:00", ocr_accuracy: 99, is_verified: true },
];

const appliances = [
  { appliance_id: 1, building_id: 1, name: "Aircon", wattage: 1000, quantity: 2, hours_per_day: 8, days_per_month: 30 },
  { appliance_id: 2, building_id: 2, name: "Elsewhere", wattage: 5000, quantity: 1, hours_per_day: 24, days_per_month: 30 },
];

describe("getReadingDifferential", () => {
  it("is present minus previous and never negative", () => {
    expect(getReadingDifferential({ reading_value: 1600, previous_reading: 1000 })).toBe(600);
    expect(getReadingDifferential({ reading_value: 900, previous_reading: 1000 })).toBe(0);
    expect(getReadingDifferential({ reading_value: 50, previous_reading: null })).toBe(50);
  });
});

describe("buildMonthlyConsumption", () => {
  it("keeps an empty month on the axis at zero", () => {
    const months = buildMonthlyConsumption(readings.slice(0, 3), 10);

    expect(months.map((point) => point.month)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"]);
    expect(months.map((point) => point.value)).toEqual([1000, 600, 0, 400]);
    expect(months[1].cost).toBe(6000);
    expect(months[2].isGap).toBe(true);
    expect(months[1].change).toBeCloseTo(-0.4);
    // No change figure against an empty month.
    expect(months[3].change).toBeNull();
  });
});

describe("buildBuildingProfile", () => {
  const profile = buildBuildingProfile({ building, meters, readings, appliances, rate: 12 });

  it("only counts this building's meters, readings and appliances", () => {
    expect(profile.totals.meterCount).toBe(2);
    expect(profile.totals.readingCount).toBe(4);
    expect(profile.appliances).toHaveLength(1);
    expect(profile.totals.consumption).toBe(1000 + 600 + 400 + 200);
    expect(profile.totals.cost).toBe(2200 * 12);
  });

  it("grades status the same way the rest of the app does", () => {
    // Jan 15 to Apr 15 = 90 days, so the intensity is annualised.
    expect(profile.totals.isAnnualized).toBe(true);
    expect(profile.totals.spanDays).toBeCloseTo(90, 0);
    expect(profile.totals.rawEui).toBe(22);
    expect(profile.totals.eui).toBeCloseTo(22 * (365 / profile.totals.spanDays));
    expect(profile.totals.status).toBe(getEnergyStatus(2200, 100, profile.totals.spanDays));
  });

  it("lists readings newest first with their meter serial", () => {
    expect(profile.readings.map((reading) => reading.record_id)).toEqual([3, 4, 2, 1]);
    expect(profile.readings[0].serial_no).toBe("B-200");
    expect(profile.totals.latestReading.record_id).toBe(3);
    expect(profile.totals.firstReadingDate).toBe("2026-01-15T08:00:00");
  });

  it("summarises each meter", () => {
    expect(profile.meters.map((meter) => meter.serial_no)).toEqual(["A-100", "B-200"]);
    const main = profile.meters[1];
    expect(main.readingCount).toBe(3);
    expect(main.consumption).toBe(2000);
    expect(main.share).toBeCloseTo(2000 / 2200);
    expect(main.latest.record_id).toBe(3);
  });

  it("treats a reading without an OCR score as manual, not 0%", () => {
    expect(profile.quality.manualCount).toBe(2);
    expect(profile.quality.ocrCount).toBe(2);
    expect(profile.quality.averageAccuracy).toBe(88);
    expect(profile.quality.lowAccuracyCount).toBe(1);
    expect(profile.quality.verifiedCount).toBe(2);
    expect(profile.quality.pendingCount).toBe(2);
  });

  it("keeps the appliance estimate separate from measured use", () => {
    // 1000 W x 2 x 8 h x 30 d / 1000 = 480 kWh/month.
    expect(profile.totals.estimatedKwhMonth).toBe(480);
    expect(profile.totals.estimatedCostMonth).toBe(480 * 12);
    expect(profile.totals.consumption).toBe(2200);
    expect(profile.totals.measuredKwhMonth).toBeCloseTo(2200 / (profile.totals.spanDays / (365 / 12)));
  });

  it("finds the peak and latest months", () => {
    expect(profile.totals.peakMonth.month).toBe("Jan 2026");
    expect(profile.totals.latestMonth.month).toBe("Apr 2026");
    expect(profile.totals.previousMonth.month).toBe("Mar 2026");
  });

  it("handles a building with nothing recorded", () => {
    const empty = buildBuildingProfile({ building: { building_id: 3, floor_area: 0 }, meters, readings, appliances });

    expect(empty.totals.status).toBe("No Data");
    expect(empty.totals.latestReading).toBeNull();
    expect(empty.monthly).toEqual([]);
    expect(empty.applianceComparison.gap).toBeNull();
    expect(empty.recommendation).toMatch(/floor area/);
  });
});

describe("getApplianceComparison", () => {
  it("allows 15% either way before flagging a gap", () => {
    expect(getApplianceComparison(110, 100, true).tone).toBe("green");
    expect(getApplianceComparison(130, 100, true).tone).toBe("amber");
    expect(getApplianceComparison(200, 100, true).tone).toBe("red");
    expect(getApplianceComparison(70, 100, true).tone).toBe("blue");
  });

  it("says why there is nothing to compare", () => {
    expect(getApplianceComparison(100, 0, false).gap).toBeNull();
    expect(getApplianceComparison(null, 100, true).text).toMatch(/Not enough readings/);
  });
});
