import { describe, expect, it } from "vitest";
import {
  MIN_MONTHS_FOR_FORECAST,
  MONTH_LABELS,
  SES_ALPHA,
  buildForecastModel,
  computeExponentialSmoothingForecast,
  computeMovingAvgForecast,
  computeWeightedMovingAvgForecast,
  fillMonthGaps,
  getForecastDirection,
  getHoldoutMonths,
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

describe("computeWeightedMovingAvgForecast", () => {
  it("weights the newest month heaviest", () => {
    // (200x1 + 300x2 + 400x3) / 6 = 333, above the plain mean of 300.
    expect(computeWeightedMovingAvgForecast([100, 200, 300, 400], 3, 2)).toEqual([333, 333]);
  });

  it("shrinks the window to the history available", () => {
    // (100x1 + 200x2) / 3 = 167.
    expect(computeWeightedMovingAvgForecast([100, 200], 3, 1)).toEqual([167]);
    expect(computeWeightedMovingAvgForecast([250], 3, 1)).toEqual([250]);
  });

  it("matches the moving average on a flat series", () => {
    expect(computeWeightedMovingAvgForecast([100, 100, 100], 3, 1)).toEqual([100]);
  });

  it("is zero with no history", () => {
    expect(computeWeightedMovingAvgForecast([], 3, 2)).toEqual([0, 0]);
  });
});

describe("computeExponentialSmoothingForecast", () => {
  it("carries the smoothed level forward flat", () => {
    expect(SES_ALPHA).toBe(0.3);
    // 100 -> 130 -> 181 at alpha 0.3.
    expect(computeExponentialSmoothingForecast([100, 200, 300], 2)).toEqual([181, 181]);
  });

  it("sits on a flat series and follows a single point", () => {
    expect(computeExponentialSmoothingForecast([100, 100, 100], 1)).toEqual([100]);
    expect(computeExponentialSmoothingForecast([5], 3)).toEqual([5, 5, 5]);
  });

  it("reacts faster at a higher alpha", () => {
    const slow = computeExponentialSmoothingForecast([100, 200, 300], 1, 0.2)[0];
    const fast = computeExponentialSmoothingForecast([100, 200, 300], 1, 0.8)[0];

    expect(fast).toBeGreaterThan(slow);
  });

  it("is zero with no history", () => {
    expect(computeExponentialSmoothingForecast([], 2)).toEqual([0, 0]);
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

describe("getHoldoutMonths", () => {
  it("holds out about 30% of the months", () => {
    expect(getHoldoutMonths(12)).toBe(4);
    expect(getHoldoutMonths(24)).toBe(7);
  });

  it("never leaves training below the minimum sample", () => {
    expect(getHoldoutMonths(4)).toBe(1);
    expect(getHoldoutMonths(5)).toBe(2);
  });

  it("is zero when nothing can be held back", () => {
    expect(getHoldoutMonths(3)).toBe(0);
    expect(getHoldoutMonths(0)).toBe(0);
  });
});

describe("buildForecastModel", () => {
  it("returns null without enough months of readings", () => {
    expect(MIN_MONTHS_FOR_FORECAST).toBe(3);
    expect(buildForecastModel([], 3, labelsFromKey)).toBeNull();
    expect(buildForecastModel(monthlyPoints("2026-01", [0, 0, 0]), 3, labelsFromKey)).toBeNull();
    expect(buildForecastModel(monthlyPoints("2026-01", [100, 0, 200]), 3, labelsFromKey)).toBeNull();
  });

  it("carries exactly the three estimators the study compares", () => {
    const model = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300, 400]), 2, labelsFromKey);

    expect(model.methods.map((entry) => entry.key)).toEqual(["average", "wma", "ses"]);
    expect(model.methods.every((entry) => entry.available)).toBe(true);
  });

  it("leads with the moving average when nothing can be tested yet", () => {
    const model = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300]), 2, labelsFromKey);

    expect(model.testedMonths).toBe(0);
    expect(model.bestKey).toBe("average");
    expect(model.methods.every((entry) => entry.error === null)).toBe(true);
    expect(model.methods.every((entry) => entry.metrics === null)).toBe(true);
  });

  it("leads with whichever estimate was closest on the held-out months", () => {
    // Training [100,200,300,400], tested on [500,600]: the weighted average
    // leans on the newest months, so it trails the climb least.
    const model = buildForecastModel(
      monthlyPoints("2026-01", [100, 200, 300, 400, 500, 600]),
      3,
      labelsFromKey
    );

    expect(model.testedMonths).toBe(2);
    expect(model.bestKey).toBe("wma");
    expect(method(model, "wma").error).toBeLessThan(method(model, "average").error);
    expect(method(model, "average").error).toBeLessThan(method(model, "ses").error);
  });

  it("reports MAE, RMSE, MAPE and R2 for every tested estimate", () => {
    // Training [100,200,300] -> moving average 200, tested against [0,500].
    const model = buildForecastModel(
      monthlyPoints("2026-01", [100, 200, 300, 0, 500]),
      1,
      labelsFromKey
    );
    const metrics = method(model, "average").metrics;

    expect(model.testedMonths).toBe(2);
    expect(metrics.mae).toBeCloseTo(250);
    expect(metrics.rmse).toBeCloseTo(Math.sqrt(65000));
    // Only the 500 month counts towards MAPE; there is no percentage against 0.
    expect(metrics.mape).toBeCloseTo(0.6);
    expect(metrics.r2).toBeCloseTo(-0.04);
    expect(method(model, "average").error).toBe(metrics.mape);
  });

  it("leaves R2 null when a single held-out month has no spread to explain", () => {
    const model = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300, 400]), 1, labelsFromKey);

    expect(model.testedMonths).toBe(1);
    expect(method(model, "average").metrics.r2).toBeNull();
    expect(method(model, "average").metrics.mae).toBeGreaterThan(0);
  });

  it("builds a chart series that bridges the last real month into the forecast", () => {
    const model = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300, 400]), 3, labelsFromKey);
    const lastActual = model.series[3];
    const upcoming = model.series.slice(4);

    expect(model.series).toHaveLength(7);
    expect(lastActual).toMatchObject({ isForecast: false, actual: 400 });
    expect(lastActual.wma).toBe(method(model, "wma").projection[0]);
    expect(lastActual.ses).toBe(method(model, "ses").projection[0]);
    expect(model.series.slice(0, 3).every((row) => row.wma === null)).toBe(true);
    expect(upcoming.map((row) => row.month)).toEqual(["May 2026", "Jun 2026", "Jul 2026"]);
    expect(upcoming.every((row) => row.isForecast && row.actual === null)).toBe(true);
    expect(model.baselineAverage).toBe(250);
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

describe("getForecastDirection", () => {
  it("is steady without a model", () => {
    expect(getForecastDirection(null)).toEqual({ label: "Steady", change: 0 });
  });

  it("compares the leading estimate against six months, not three", () => {
    const rising = buildForecastModel(monthlyPoints("2026-01", [100, 200, 300, 400, 500, 600]), 3, labelsFromKey);
    const falling = buildForecastModel(monthlyPoints("2026-01", [600, 500, 400, 300, 200, 100]), 3, labelsFromKey);
    const flat = buildForecastModel(monthlyPoints("2026-01", [100, 100, 100, 100]), 3, labelsFromKey);

    expect(getForecastDirection(rising).label).toBe("Rising");
    expect(getForecastDirection(falling).label).toBe("Falling");
    // A tie between estimates goes to the moving average, listed first.
    expect(flat.bestKey).toBe("average");
    expect(getForecastDirection(flat)).toEqual({ label: "Steady", change: 0 });
  });

  it("measures against six months, so a moving average can still show a trend", () => {
    // The regression this guards: the moving average IS the mean of the last
    // three months. Compared against a three-month baseline its change was
    // exactly zero, so the indicator read "Steady" however consumption moved.
    const falling = buildForecastModel(
      monthlyPoints("2026-01", [180000, 183000, 181000, 171000, 161000, 151000]),
      3,
      labelsFromKey
    );

    // Six-month mean, not the 161,000 the last three months average to.
    expect(falling.baselineAverage).toBeCloseTo(171166.67, 1);

    const movingAverage = method(falling, "average").projection[0];
    const change = (movingAverage - falling.baselineAverage) / falling.baselineAverage;

    expect(change).toBeLessThan(-0.03);
    expect(getForecastDirection(falling).label).toBe("Falling");
  });
});
