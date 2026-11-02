import { describe, expect, it } from "vitest";
import {
  buildBuildingProfile,
  buildMonthlyConsumption,
  getApplianceComparison,
  getApplianceEui,
  getApplianceStatus,
} from "./buildingProfile";
import { prepareReadings } from "./consumption";
import { EUI_CRITICAL_THRESHOLD, EUI_HIGH_THRESHOLD, getEnergyStatus } from "./energyStatus";

const building = { building_id: 1, name: "Admin", floor_area: 100 };

// Added before their first readings, so those readings' kWh count: meter 10's
// first reading covers Dec 16 to Jan 15, meter 11's Jan 21 to Feb 20.
const meters = [
  { meter_id: 10, building_id: 1, serial_no: "B-200", created_at: "2025-12-16T08:00:00" },
  { meter_id: 11, building_id: 1, serial_no: "A-100", created_at: "2026-01-21T08:00:00" },
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

describe("buildMonthlyConsumption", () => {
  it("spreads a skipped month's reading over both months, not 0 then double", () => {
    // Read Feb 1, then not until Apr 1: 590 kWh over February (28 days) and
    // March (31 days).
    const months = buildMonthlyConsumption(
      prepareReadings(
        [
          { record_id: 1, meter_id: 1, previous_reading: 0, reading_value: 310, reading_date: "2026-02-01T00:00:00" },
          { record_id: 2, meter_id: 1, previous_reading: 310, reading_value: 900, reading_date: "2026-04-01T00:00:00" },
        ],
        [{ meter_id: 1, created_at: "2026-01-01T00:00:00" }]
      ),
      10
    );

    expect(months.map((point) => point.month)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(months[0].value).toBeCloseTo(310);
    expect(months[1].value).toBeCloseTo(280);
    expect(months[2].value).toBeCloseTo(310);
    expect(months[1].cost).toBeCloseTo(2800);
    expect(months[1].change).toBeCloseTo(-30 / 310);
    expect(months[0].change).toBeNull();
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
    // Dec 16 (meter 10 added) to Apr 15 = 120 days, so the intensity is annualised.
    expect(profile.totals.isAnnualized).toBe(true);
    expect(profile.totals.spanDays).toBeCloseTo(120, 0);
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

  it("expresses the appliance estimate as an expected EUI on the same bands", () => {
    // 480 kWh/month x 12 = 5,760 kWh/yr over 100 m².
    expect(profile.totals.estimatedEui).toBeCloseTo(57.6);
    expect(profile.totals.estimatedStatus).toBe(getEnergyStatus(5760, 100));
    expect(profile.appliances[0].eui).toBeCloseTo(57.6);
  });

  it("splits the expected EUI into shares that add up to it", () => {
    const listed = [
      { appliance_id: 1, building_id: 1, name: "Aircon", wattage: 1200, quantity: 6, hours_per_day: 8, days_per_month: 22 },
      { appliance_id: 2, building_id: 1, name: "Lights", wattage: 18, quantity: 80, hours_per_day: 10, days_per_month: 22 },
    ];
    const withShares = buildBuildingProfile({ building, meters, readings, appliances: listed });
    const sum = withShares.appliances.reduce((total, appliance) => total + appliance.eui, 0);

    expect(sum).toBeCloseTo(withShares.totals.estimatedEui);
    expect(withShares.appliances.map((appliance) => appliance.name)).toEqual(["Aircon", "Lights"]);
  });

  it("never lets the appliance list change the measured status or EUI", () => {
    const heavy = [
      { appliance_id: 1, building_id: 1, name: "Chiller", wattage: 50000, quantity: 1, hours_per_day: 24, days_per_month: 30 },
    ];
    const without = buildBuildingProfile({ building, meters, readings, appliances: [] });
    const withHeavy = buildBuildingProfile({ building, meters, readings, appliances: heavy });

    expect(withHeavy.totals.estimatedStatus).toBe("Critical");
    expect(withHeavy.totals.status).toBe(without.totals.status);
    expect(withHeavy.totals.eui).toBe(without.totals.eui);
    expect(withHeavy.recommendation).toBe(without.recommendation);
  });

  it("has no expected EUI without appliances", () => {
    const without = buildBuildingProfile({ building, meters, readings, appliances: [] });

    expect(without.totals.estimatedEui).toBe(0);
    expect(without.totals.estimatedStatus).toBe("No Data");
  });

  it("finds the peak and latest months, whole months only", () => {
    // December starts partway (Dec 16) and April is not over (Apr 15). Meter 11,
    // last read Feb 20, is more than 45 days behind and does not hold March back.
    expect(profile.monthly.map((point) => point.month)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(profile.totals.peakMonth.month).toBe("Jan 2026");
    expect(profile.totals.latestMonth.month).toBe("Mar 2026");
    expect(profile.totals.previousMonth.month).toBe("Feb 2026");
    // Meter 10's Feb 15 to Apr 15 reading, 400 kWh over 59 days, 31 of them March.
    expect(profile.totals.latestMonth.value).toBeCloseTo((400 * 31) / 59);
  });

  it("leaves a sub-meter out of the total but lists its kWh", () => {
    const withSub = buildBuildingProfile({
      building,
      meters: meters.map((meter) => (meter.meter_id === 11 ? { ...meter, is_submeter: true } : meter)),
      readings,
      appliances: [],
    });
    const sub = withSub.meters.find((meter) => meter.meter_id === 11);

    expect(withSub.totals.consumption).toBe(2000);
    expect(sub.is_submeter).toBe(true);
    expect(sub.consumption).toBe(200);
    expect(sub.share).toBeCloseTo(200 / 2000);
  });

  it("applies each meter's multiplier", () => {
    const withCt = buildBuildingProfile({
      building,
      meters: meters.map((meter) => (meter.meter_id === 11 ? { ...meter, multiplier: 40 } : meter)),
      readings,
      appliances: [],
    });

    expect(withCt.totals.consumption).toBe(2000 + 200 * 40);
    expect(withCt.meters.find((meter) => meter.meter_id === 11).multiplier).toBe(40);
    expect(withCt.meters.find((meter) => meter.meter_id === 10).multiplier).toBe(1);
  });

  it("counts no kWh for a first reading older than its meter", () => {
    // Backfilled history: nothing says when the starting value was read.
    const backfilled = buildBuildingProfile({
      building,
      meters: meters.map((meter) => ({ ...meter, created_at: "2026-06-01T08:00:00" })),
      readings,
      appliances: [],
    });
    const first = backfilled.readings.find((reading) => reading.record_id === 1);

    expect(first.is_baseline).toBe(true);
    expect(first.differential).toBe(0);
    expect(backfilled.totals.consumption).toBe(600 + 400);
    // Measured from that starting point (Jan 15) to Apr 15.
    expect(backfilled.totals.spanDays).toBeCloseTo(90, 0);
  });

  it("handles a building with nothing recorded", () => {
    const empty = buildBuildingProfile({ building: { building_id: 3, floor_area: 0 }, meters, readings, appliances });

    expect(empty.totals.status).toBe("No Data");
    expect(empty.totals.latestReading).toBeNull();
    expect(empty.monthly).toEqual([]);
    expect(empty.applianceComparison.gap).toBeNull();
    expect(empty.recommendation).toMatch(/floor area/);
  });

  it("cannot grade the appliance list without a floor area", () => {
    const noArea = buildBuildingProfile({
      building: { ...building, floor_area: 0 },
      meters,
      readings,
      appliances,
    });

    expect(noArea.totals.estimatedKwhMonth).toBe(480);
    expect(noArea.totals.estimatedEui).toBe(0);
    expect(noArea.totals.estimatedStatus).toBe("No Data");
    expect(noArea.appliances[0].eui).toBe(0);
  });
});

describe("getApplianceEui", () => {
  it("is a month's kWh x 12 over the floor area", () => {
    // The worked example: 2,766.72 kWh/month over 400 m².
    expect(getApplianceEui(2766.72, 400)).toBeCloseTo(83.0, 1);
    expect(getApplianceEui(100, 0)).toBe(0);
    expect(getApplianceEui(0, 400)).toBe(0);
  });

  it("grades on the same thresholds as measured use", () => {
    const kwhMonthAt = (eui) => (eui * 100) / 12;

    expect(getApplianceStatus(kwhMonthAt(EUI_HIGH_THRESHOLD), 100)).toBe("Normal");
    expect(getApplianceStatus(kwhMonthAt(EUI_HIGH_THRESHOLD + 1), 100)).toBe("High");
    expect(getApplianceStatus(kwhMonthAt(EUI_CRITICAL_THRESHOLD + 1), 100)).toBe("Critical");
    expect(getApplianceStatus(0, 100)).toBe("No Data");
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
