// Shared consumption forecasting used by the Dashboard and Analytics pages.
// Both draw the same two estimates over historical monthly totals:
//   · Moving average — flat projection of the last N months
//   · Linear trend   — least-squares fit extended forward
//
// Two things this deliberately gets right, having previously got them wrong:
//
// 1. **Gap months are kept, not deleted.** The old version filtered with
//    `values.filter(v => v > 0)` and then regressed against the surviving array
//    index. A building with Jan 100, Feb 0, Mar 300 was fitted as two *adjacent*
//    points, giving a slope of 200/month instead of 100. The x axis is now the real
//    month offset, so a gap costs nothing and a zero month means zero.
//
// 2. **A forecast needs a minimum sample.** With one month of data both estimators
//    used to return that single value repeated across the horizon, and the UI drew
//    a full chart with a "Predicted from…" badge off one data point. Below
//    MIN_MONTHS_FOR_FORECAST nothing is drawn at all.
//
// On zero-filling: a month with no reading is filled with 0, which reflects the
// data as recorded rather than inventing a value. When a reading is skipped, the
// consumption still happens but lands in the next reading's differential, so the
// skipped month legitimately has nothing recorded against it and the following
// month carries two months' worth. Spreading it backwards would be fabricating
// readings that were never taken. Be ready to say this if asked: the honest fix is
// to take readings every month, not to smooth over the ones that were missed.

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Two points define a line exactly and say nothing about trend. Three is the
// minimum at which a fit carries any information; say so on the slide.
export const MIN_MONTHS_FOR_FORECAST = 3;

/** "YYYY-MM" -> absolute month number, for arithmetic across year boundaries. */
function sortKeyToMonthIndex(sortKey) {
  const [yearPart, monthPart] = String(sortKey || "").split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return year * 12 + (month - 1);
}

function monthIndexToSortKey(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;

  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthIndexToLabel(index) {
  const year = Math.floor(index / 12);
  const month = index % 12;

  return `${MONTH_LABELS[month]} ${year}`;
}

/**
 * Inserts zero-valued entries for calendar months missing from `points`, so the
 * series is continuous and a regression over it is a regression over time.
 *
 * Requires each point to carry a "YYYY-MM" `sortKey`. Points without one are
 * returned untouched, which covers callers that already build a dense series.
 */
export function fillMonthGaps(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return points || [];
  }

  const indexed = points
    .map((point) => ({ point, index: sortKeyToMonthIndex(point.sortKey) }))
    .filter((entry) => entry.index !== null);

  if (indexed.length !== points.length) {
    return points;
  }

  indexed.sort((a, b) => a.index - b.index);

  const byIndex = new Map(indexed.map((entry) => [entry.index, entry.point]));
  const first = indexed[0].index;
  const last = indexed[indexed.length - 1].index;

  // Guard against a nonsense range producing a huge array.
  if (last - first > 600) {
    return points;
  }

  const filled = [];

  for (let index = first; index <= last; index += 1) {
    const existing = byIndex.get(index);

    if (existing) {
      filled.push(existing);
      continue;
    }

    filled.push({
      sortKey: monthIndexToSortKey(index),
      month: monthIndexToLabel(index),
      value: 0,
      isGap: true,
    });
  }

  return filled;
}

/** Flat projection of the mean of the last `windowSize` months. */
export function computeMovingAvgForecast(values, windowSize = 3, horizon = 3) {
  if (!values.length) {
    return Array(horizon).fill(0);
  }

  // Named `size`, not `window`: a local called window shadows the global, which is
  // the same trap that made `new Map()` throw once lucide's Map icon was imported.
  const size = Math.min(windowSize, values.length);
  const slice = values.slice(-size);
  const avg = Math.round(slice.reduce((sum, value) => sum + value, 0) / size);

  return Array(horizon).fill(avg);
}

/**
 * Ordinary least squares over the series, extended forward.
 *
 * x is the position in the series, which is the month offset because the caller
 * passes a gap-filled series. Zero months are real observations here.
 */
export function computeLinearForecast(values, horizon = 3) {
  const n = values.length;

  if (n < 2) {
    return Array(horizon).fill(n === 1 ? Math.round(values[0]) : 0);
  }

  const x = values.map((_, index) => index);
  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = x.reduce((sum, value, index) => sum + value * values[index], 0);
  const sumX2 = x.reduce((sum, value) => sum + value * value, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (denom === 0) {
    return Array(horizon).fill(Math.round(sumY / n));
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: horizon }, (_, i) =>
    Math.max(0, Math.round(intercept + slope * (n + i)))
  );
}

/**
 * Coefficient of determination for the linear fit, 0 to 1. Reported so the UI can
 * say how well the trend actually describes the data instead of drawing a
 * confident-looking line over noise.
 */
export function computeLinearFitQuality(values) {
  const n = values.length;

  if (n < 3) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const x = values.map((_, index) => index);
  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = x.reduce((sum, value, index) => sum + value * values[index], 0);
  const sumX2 = x.reduce((sum, value) => sum + value * value, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (denom === 0) {
    return 0;
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  let residual = 0;
  let total = 0;

  values.forEach((value, index) => {
    const predicted = intercept + slope * index;
    residual += (value - predicted) ** 2;
    total += (value - mean) ** 2;
  });

  if (total === 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, 1 - residual / total));
}

/** Month-only labels ("Sep" -> ["Oct", "Nov"]) for the year-less axis. */
export function getNextMonthLabels(lastMonthLabel, count) {
  const idx = MONTH_LABELS.indexOf(lastMonthLabel);
  if (idx === -1) return MONTH_LABELS.slice(0, count);
  return Array.from(
    { length: count },
    (_, i) => MONTH_LABELS[(idx + 1 + i) % 12]
  );
}

/**
 * Month + year labels from a sortable "YYYY-MM" key ("2025-11" -> ["Dec 2025",
 * "Jan 2026"]). The year has to come from the data, not from today's date, or a
 * forecast built on older readings gets stamped with the wrong year.
 */
export function getNextMonthLabelsFromKey(lastSortKey, count) {
  const [yearPart, monthPart] = String(lastSortKey || "").split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const isUsable =
    Number.isInteger(year) && monthIndex >= 0 && monthIndex <= 11;
  if (!isUsable) {
    return Array.from({ length: count }, (_, i) => `M+${i + 1}`);
  }
  return Array.from({ length: count }, (_, i) => {
    const offset = monthIndex + 1 + i;
    return `${MONTH_LABELS[offset % 12]} ${year + Math.floor(offset / 12)}`;
  });
}

// A seasonal estimate needs a full year of history to look back on.
export const MIN_MONTHS_FOR_SEASONAL = 12;

/**
 * Same month last year, scaled by how the most recent months compare with the same
 * months a year earlier.
 *
 * Building load here follows the hot season (peaking around April), so a straight
 * line through a year of it points the wrong way for half of that year: on the demo
 * data the linear trend kept climbing into September while usage had been falling
 * for four months and last September was a third lower.
 *
 * Returns null with less than a year of history.
 */
export function computeSeasonalForecast(values, horizon = 3) {
  const n = values.length;

  if (n < MIN_MONTHS_FOR_SEASONAL) {
    return null;
  }

  const compareMonths = Math.min(3, n - 12);
  let ratio = 1;

  if (compareMonths > 0) {
    const recent = values
      .slice(n - compareMonths)
      .reduce((sum, value) => sum + value, 0);
    const yearEarlier = values
      .slice(n - compareMonths - 12, n - 12)
      .reduce((sum, value) => sum + value, 0);

    if (recent > 0 && yearEarlier > 0) {
      // Clamped so one unusual month cannot double or halve the whole projection.
      ratio = Math.min(2, Math.max(0.5, recent / yearEarlier));
    }
  }

  return Array.from({ length: horizon }, (_, i) =>
    Math.max(0, Math.round(values[n - 12 + (i % 12)] * ratio))
  );
}

const FORECAST_METHODS = {
  average: {
    label: "Moving average",
    minMonths: MIN_MONTHS_FOR_FORECAST,
    run: (values, horizon) => computeMovingAvgForecast(values, 3, horizon),
  },
  trend: {
    label: "Linear trend",
    minMonths: MIN_MONTHS_FOR_FORECAST,
    run: (values, horizon) => computeLinearForecast(values, horizon),
  },
  seasonal: {
    label: "Same month last year",
    minMonths: MIN_MONTHS_FOR_SEASONAL,
    run: (values, horizon) => computeSeasonalForecast(values, horizon),
  },
};

/**
 * Mean absolute percentage error when `run` forecasts the last `holdout` months
 * using only the months before them. Zero months are skipped, since there is no
 * percentage error against nothing.
 */
function backtestError(values, run, holdout) {
  const training = values.slice(0, values.length - holdout);
  const actual = values.slice(values.length - holdout);
  const predicted = run(training, holdout);

  if (!predicted) {
    return null;
  }

  let total = 0;
  let count = 0;

  actual.forEach((value, index) => {
    if (value > 0) {
      total += Math.abs(predicted[index] - value) / value;
      count += 1;
    }
  });

  return count ? total / count : null;
}

/**
 * Trims leading and trailing months with no data, fills interior gaps, and checks
 * there is enough history to forecast from. Returns null when there is not.
 */
function prepareForecastSeries(points) {
  if (!Array.isArray(points) || !points.length) {
    return null;
  }

  // Trim leading and trailing months with no data, then fill any interior gaps, so
  // the series starts and ends at real observations but stays continuous between.
  const firstReal = points.findIndex((point) => point.value > 0);
  const lastReal = points.reduce(
    (last, point, index) => (point.value > 0 ? index : last),
    -1
  );

  if (firstReal === -1) {
    return null;
  }

  const trimmed = points.slice(firstReal, lastReal + 1);
  const series = fillMonthGaps(trimmed);

  // Sample size is the number of months that actually carry a reading.
  const observedMonths = series.filter((point) => point.value > 0).length;

  if (observedMonths < MIN_MONTHS_FOR_FORECAST) {
    return null;
  }

  return series;
}

/**
 * Everything the Analytics forecast panel shows: each method's projection, how far
 * off each one was when tested on recent months, and which one to lead with.
 *
 * The leading method is whichever came closest on the most recent months when
 * forecasting them from the months before. That is a claim anyone can check, unlike
 * showing two disagreeing numbers with nothing to say which one to believe.
 *
 * Returns null when there is not enough history, like buildForecastSeries's [].
 *
 * @returns {{
 *   series: Array<{ month, actual, average, trend, seasonal, isGap, isForecast }>,
 *   methods: Array<{ key, label, minMonths, available, projection, error }>,
 *   bestKey: string,
 *   testedMonths: number,
 *   trendFit: number,
 *   recentAverage: number,
 * } | null}
 */
export function buildForecastModel(points, horizon, buildFutureLabels) {
  const series = prepareForecastSeries(points);

  if (!series) {
    return null;
  }

  const values = series.map((point) => point.value);
  const n = values.length;

  // All methods are tested on the same most-recent months so their errors compare.
  // The seasonal method needs a full year before the months it is tested on, so once
  // it can be tested at all (13+ months) the test window shrinks to fit it. Before
  // that it is still drawn, but left out of the ranking.
  const baseHoldout = Math.min(3, n - MIN_MONTHS_FOR_FORECAST);
  const testedMonths =
    n > MIN_MONTHS_FOR_SEASONAL
      ? Math.min(baseHoldout, n - MIN_MONTHS_FOR_SEASONAL)
      : baseHoldout;

  const methods = Object.entries(FORECAST_METHODS).map(([key, method]) => {
    const projection = method.run(values, horizon);
    const isTestable = testedMonths > 0 && n - testedMonths >= method.minMonths;

    return {
      key,
      label: method.label,
      minMonths: method.minMonths,
      available: Boolean(projection),
      projection: projection || null,
      error:
        projection && isTestable
          ? backtestError(values, method.run, testedMonths)
          : null,
    };
  });

  const tested = methods.filter(
    (method) => method.available && method.error !== null
  );
  const best = tested.length
    ? tested.reduce((winner, method) =>
        method.error < winner.error ? method : winner
      )
    : methods.find((method) => method.key === "average");

  const projectionsAt = (index) =>
    Object.fromEntries(
      methods.map((method) => [
        method.key,
        method.projection ? method.projection[index] : null,
      ])
    );
  const noProjections = Object.fromEntries(
    methods.map((method) => [method.key, null])
  );

  const historical = series.map((point, index) => ({
    month: point.month,
    actual: point.value,
    isGap: Boolean(point.isGap),
    isForecast: false,
    // Each estimate's first month is also written onto the last real month, so its
    // dashed line starts at the last bar instead of floating on its own.
    ...(index === n - 1 ? projectionsAt(0) : noProjections),
  }));

  const upcoming = buildFutureLabels(series[n - 1], horizon).map(
    (month, index) => ({
      month,
      actual: null,
      isGap: false,
      isForecast: true,
      ...projectionsAt(index),
    })
  );

  const recentValues = values.slice(-3);

  return {
    series: historical.concat(upcoming),
    methods,
    bestKey: best.key,
    testedMonths: tested.length ? testedMonths : 0,
    trendFit: computeLinearFitQuality(values),
    recentAverage:
      recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length,
  };
}

/**
 * Combines historical months with `horizon` forecast months into one series.
 * Both estimates are also written onto the last historical point so the dashed
 * forecast lines visually bridge from the actual bars.
 *
 * Returns [] when there is not enough history to forecast responsibly, so callers
 * should show their "add more readings" empty state on an empty array.
 *
 * @param points            [{ month, value, sortKey? }] ordered oldest to newest.
 * @param horizon           How many months to project.
 * @param buildFutureLabels (lastPoint, horizon) => string[] label generator.
 * @returns [{ month, actual, ma, linear, isForecast }]
 */
export function buildForecastSeries(points, horizon, buildFutureLabels) {
  const series = prepareForecastSeries(points);

  if (!series) {
    return [];
  }

  const values = series.map((point) => point.value);
  const maForecast = computeMovingAvgForecast(values, 3, horizon);
  const linearForecast = computeLinearForecast(values, horizon);
  const lastPoint = series[series.length - 1];
  const futureLabels = buildFutureLabels(lastPoint, horizon);

  const historical = series.map((point, idx) => {
    const isLast = idx === series.length - 1;
    return {
      month: point.month,
      actual: point.value,
      ma: isLast ? maForecast[0] : null,
      linear: isLast ? linearForecast[0] : null,
      isForecast: false,
    };
  });

  const forecast = futureLabels.map((month, i) => ({
    month,
    actual: null,
    ma: maForecast[i],
    linear: linearForecast[i],
    isForecast: true,
  }));

  return [...historical, ...forecast];
}
