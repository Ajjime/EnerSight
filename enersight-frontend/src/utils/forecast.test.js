import { describe, expect, it } from "vitest";
import {
  MIN_MONTHS_FOR_FORECAST,
  MIN_MONTHS_FOR_SEASONAL,
  MONTH_LABELS,
  buildForecastModel,
  computeLinearFitQuality,
  computeLinearForecast,
  computeMovingAvgForecast,
  computeSeasonalForecast,
  fillMonthGaps,
  getNextMonthLabels,
  getNextMonthLabelsFromKey,
} from "./forecast";

/** Consecutive monthly points starting at "YYYY-MM". */
function monthlyPoints(startKey, values) {
  const [year, month] = startKey.split("-").map(Number);

  return values.map((value, index) => {
    const offset = month - 1 + index;
    const pointYear = year + Math.floor(offset / 12);
    const pointMonth = offset % 12;

    return {
      sortKey: `${pointYear}-${String(pointMonth + 1).padStart(2, "0")}`,
      month: `${MONTH_LABELS[pointMonth]} ${pointYear}`,
      value,
    };
  });
}

const labelsFromKey = (lastPoint, count) =>
  getNextMonthLabelsFromKey(lastPoint.sortKey, count);

/** Hot-season demand peaking around April, with slight growth. */
function seasonalValues(count) {
  return Array.from({ length: count }, (_, index) => {
    const month = (7 + index) % 12;
    return Math.round(
      1000 * (1 + 0.3 * Math.sin((month / 12) * 2 * Math.PI)) * (1 + 0.01 * index)
    );
  });
}

const method = (model, key) => model.methods.find((entry) => entry.key === key);

describe("fillMonthGaps", () => {
  it("returns short or unkeyed input untouched", () => {
    const single = [{ sortKey: "2026-01", value: 5 }];
    const unkeyed = [{ value: 1 }, { value: 2 }];

    expect(fillMonthGaps(single)).toBe(single);
    expect(fillMonthGaps(unkeyed)).toBe(unkeyed);
    expect(fillMonthGaps(null)).toEqual([]);
  });

  it("inserts zero months across a year boundary", () => {
    const november = { sortKey: "2025-11", month: "Nov 2025", value: 100 };
    const february = { sortKey: "2026-02", month: "Feb 2026", value: 300 };
    const filled = fillMonthGaps([february, november]);

    expect(filled).toEqual([
      november,
      { sortKey: "2025-12", month: "Dec 2025", value: 0, isGap: true },
      { sortKey: "2026-01", month: "Jan 2026", value: 0, isGap: true },
      february,
    ]);
  });
});

describe("computeMovingAvgForecast", () => {
  it("repeats the mean of the last months", () => {
    expect(computeMovingAvgForecast([100, 200, 300, 400], 3, 2)).toEqual([300, 300]);
    expect(computeMovingAvgForecast([100, 200], 3, 1)).toEqual([150]);
    expect(computeMovingAvgForecast([1, 2], 3, 1)).toEqual([2]);
  });

  it("is zero with no history", () => {
    expect(computeMovingAvgForecast([], 3, 2)).toEqual([0, 0]);
  });
});

describe("computeLinearForecast", () => {
  it("extends a straight line", () => {
    expect(computeLinearForecast([100, 200, 300], 3)).toEqual([400, 500, 600]);
    expect(computeLinearForecast([100, 100, 100], 2)).toEqual([100, 100]);
  });

  it("never forecasts negative usage", () => {
    expect(computeLinearForecast([300, 200, 100], 2)).toEqual([0, 0]);
  });

  it("counts a gap month as a real zero, not a missing point", () => {
    // Dropping the zero would fit 100 -> 300 as adjacent months and forecast 500.
    expect(computeLinearForecast([100, 0, 300], 1)).toEqual([333]);
  });

  it("handles too little history", () => {
    expect(computeLinearForecast([], 2)).toEqual([0, 0]);
    expect(computeLinearForecast([5], 3)).toEqual([5, 5, 5]);
  });
});

describe("computeLinearFitQuality", () => {
  it("is 1 for a perfect line and 0 for a flat or tiny series", () => {
    expect(computeLinearFitQuality([100, 200, 300, 400])).toBeCloseTo(1);
    expect(computeLinearFitQuality([100, 100, 100])).toBe(0);
    expect(computeLinearFitQuality([100, 200])).toBe(0);
  });

  it("falls between 0 and 1 for noisy data", () => {
    const fit = computeLinearFitQuality([100, 300, 150, 400, 200]);
    expect(fit).toBeGreaterThan(0);
    expect(fit).toBeLessThan(1);
  });
});

describe("month labels", () => {
  it("wraps month-only labels", () => {
    expect(getNextMonthLabels("Nov", 3)).toEqual(["Dec", "Jan", "Feb"]);
    expect(getNextMonthLabels("Nope", 2)).toEqual(["Jan", "Feb"]);
  });

  it("carries the year from the data", () => {
    expect(getNextMonthLabelsFromKey("2025-11", 3)).toEqual(["Dec 2025", "Jan 2026", "Feb 2026"]);
    expect(getNextMonthLabelsFromKey("2026-12", 1)).toEqual(["Jan 2027"]);
    expect(getNextMonthLabelsFromKey("garbage", 2)).toEqual(["M+1", "M+2"]);
    expect(getNextMonthLabelsFromKey("2026-13", 1)).toEqual(["M+1"]);
  });
});

describe("computeSeasonalForecast", () => {
  const firstYear = Array.from({ length: 12 }, (_, index) => (index + 1) * 100);

  it("needs a full year", () => {
    expect(MIN_MONTHS_FOR_SEASONAL).toBe(12);
    expect(computeSeasonalForecast(firstYear.slice(0, 11), 3)).toBeNull();
  });

  it("repeats last year's months when there is nothing newer to compare", () => {
    expect(computeSeasonalForecast(firstYear, 3)).toEqual([100, 200, 300]);
  });

  it("scales by how recent months compare with a year earlier", () => {
    // Months 13-15 run 10% above months 1-3, so months 16-18 are 10% above 4-6.
    expect(computeSeasonalForecast([...firstYear, 110, 220, 330], 3)).toEqual([440, 550, 660]);
  });

  it("caps the growth so one odd stretch cannot run away", () => {
    // 2.2x is clamped to 2x.
    expect(computeSeasonalForecast([...firstYear, 220, 440, 660], 3)).toEqual([800, 1000, 1200]);
  });
});

describe("buildForecastModel", () => {
  it("returns null without enough months of readings", () => {
    expect(MIN_MONTHS_FOR_FORECAST).toBe(3);
    expect(buildForecastModel([], 3, labelsFromKey)).toBeNull();
    expect(buildForecastModel(monthlyPoints("2026-01", [0, 0, 0]), 3, labelsFromKey)).toBeNull();
    expect(buildForecastModel(monthlyPoints("2026-01", [100, 0, 200]), 3, labelsFromKey)).toBeNull();
  });

  it("leads with the moving average when nothing can be tested yet", () => {
    const model = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300]), 2, labelsFromKey);

    expect(model.testedMonths).toBe(0);
    expect(model.bestKey).toBe("average");
    expect(model.methods.every((entry) => entry.error === null)).toBe(true);
    expect(method(model, "seasonal").available).toBe(false);
    expect(method(model, "seasonal").projection).toBeNull();
  });

  it("leads with whichever estimate was closest on recent months", () => {
    const model = buildForecastModel(
      monthlyPoints("2026-01", [100, 200, 300, 400, 500, 600]),
      3,
      labelsFromKey
    );

    expect(model.testedMonths).toBe(3);
    expect(model.bestKey).toBe("trend");
    expect(method(model, "trend").error).toBeCloseTo(0);
    expect(method(model, "average").error).toBeGreaterThan(0.5);
  });

  it("skips zero months when scoring an estimate", () => {
    const model = buildForecastModel(
      monthlyPoints("2026-01", [100, 200, 300, 0, 500]),
      1,
      labelsFromKey
    );

    // Tested on [0, 500]; only the 500 month counts.
    expect(model.testedMonths).toBe(2);
    expect(method(model, "trend").error).toBeCloseTo(0);
    expect(method(model, "average").error).toBeCloseTo(0.6);
  });

  it("draws the seasonal estimate at 12 months but only ranks it from 13", () => {
    const twelve = buildForecastModel(monthlyPoints("2025-08", seasonalValues(12)), 3, labelsFromKey);
    expect(method(twelve, "seasonal").available).toBe(true);
    expect(method(twelve, "seasonal").error).toBeNull();
    expect(twelve.testedMonths).toBe(3);
    expect(["average", "trend"]).toContain(twelve.bestKey);

    const thirteen = buildForecastModel(monthlyPoints("2025-08", seasonalValues(13)), 3, labelsFromKey);
    expect(thirteen.testedMonths).toBe(1);
    expect(thirteen.methods.every((entry) => entry.error !== null)).toBe(true);
  });

  it("prefers the seasonal estimate on seasonal data", () => {
    const model = buildForecastModel(monthlyPoints("2025-08", seasonalValues(15)), 3, labelsFromKey);
    const seasonalError = method(model, "seasonal").error;

    expect(model.testedMonths).toBe(3);
    expect(model.bestKey).toBe("seasonal");
    expect(seasonalError).toBeLessThan(method(model, "average").error);
    expect(seasonalError).toBeLessThan(method(model, "trend").error);
  });

  it("builds a chart series that bridges the last real month into the forecast", () => {
    const model = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300, 400]), 3, labelsFromKey);
    const lastActual = model.series[3];
    const upcoming = model.series.slice(4);

    expect(model.series).toHaveLength(7);
    expect(lastActual).toMatchObject({ isForecast: false, actual: 400 });
    expect(lastActual.trend).toBe(method(model, "trend").projection[0]);
    expect(lastActual.seasonal).toBeNull();
    expect(model.series.slice(0, 3).every((row) => row.trend === null)).toBe(true);
    expect(upcoming.map((row) => row.month)).toEqual(["May 2026", "Jun 2026", "Jul 2026"]);
    expect(upcoming.every((row) => row.isForecast && row.actual === null)).toBe(true);
    expect(model.recentAverage).toBe(300);
    expect(model.trendFit).toBeGreaterThanOrEqual(0);
    expect(model.trendFit).toBeLessThanOrEqual(1);
  });

  it("keeps a month with no readings on the chart as a flagged zero", () => {
    const points = [
      { sortKey: "2026-01", month: "Jan 2026", value: 100 },
      { sortKey: "2026-03", month: "Mar 2026", value: 300 },
      { sortKey: "2026-04", month: "Apr 2026", value: 400 },
    ];
    const model = buildForecastModel(points, 1, labelsFromKey);

    expect(model.series[1]).toMatchObject({ month: "Feb 2026", actual: 0, isGap: true });
  });
});
