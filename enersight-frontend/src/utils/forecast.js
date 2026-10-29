// Shared consumption forecasting used by the Dashboard and Analytics pages.
// Both build the same model (buildForecastModel) over historical monthly totals
// and lead with whichever estimate tested best on recent months:
//   · Moving average               — mean of the last 3 months, projected flat
//   · Weighted moving average      — same window, newest month weighted most
//   · Simple exponential smoothing — smoothed level carried forward
//
// These are the three estimators the study tests and compares. Keep this list
// and FORECAST_METHODS in step with Table 4 of the manuscript.
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

// Chart colour for each estimate, shared by every forecast chart, legend and
// method chip. Kept here rather than in ForecastChart.jsx because a component
// file that also exports constants breaks React fast refresh.
export const FORECAST_COLORS = {
  average: "#2a78d6",
  wma: "#eb6834",
  ses: "#4a3aa7",
};

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
 * Weighted moving average over the last `windowSize` months, with linearly
 * increasing weights so the newest month counts most (1, 2, 3 across a 3-month
 * window). Flat across the horizon, like the plain moving average.
 */
export function computeWeightedMovingAvgForecast(
  values,
  windowSize = 3,
  horizon = 3
) {
  if (!values.length) {
    return Array(horizon).fill(0);
  }

  const size = Math.min(windowSize, values.length);
  const slice = values.slice(-size);

  let weighted = 0;
  let weightTotal = 0;

  slice.forEach((value, index) => {
    const weight = index + 1;
    weighted += value * weight;
    weightTotal += weight;
  });

  return Array(horizon).fill(Math.max(0, Math.round(weighted / weightTotal)));
}

// Smoothing constant for simple exponential smoothing. 0.3 leans on the history
// rather than chasing the newest month. It is a fixed, documented constant
// rather than a fitted one, so the projection can be explained without also
// having to explain a search procedure.
export const SES_ALPHA = 0.3;

/**
 * Simple exponential smoothing, level only.
 *
 *   S(1) = y(1),  S(t) = alpha * y(t) + (1 - alpha) * S(t-1),  forecast = S(n)
 *
 * SES without a trend component projects that level forward flat, so every month
 * of the horizon carries the same figure.
 */
export function computeExponentialSmoothingForecast(
  values,
  horizon = 3,
  alpha = SES_ALPHA
) {
  if (!values.length) {
    return Array(horizon).fill(0);
  }

  let level = values[0];

  for (let index = 1; index < values.length; index += 1) {
    level = alpha * values[index] + (1 - alpha) * level;
  }

  return Array(horizon).fill(Math.max(0, Math.round(level)));
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

const FORECAST_METHODS = {
  average: {
    label: "Moving average",
    // Table 4's abbreviation, for the narrow Dashboard card.
    shortLabel: "Moving avg",
    minMonths: MIN_MONTHS_FOR_FORECAST,
    run: (values, horizon) => computeMovingAvgForecast(values, 3, horizon),
  },
  wma: {
    label: "Weighted moving average",
    shortLabel: "Weighted MA",
    minMonths: MIN_MONTHS_FOR_FORECAST,
    run: (values, horizon) =>
      computeWeightedMovingAvgForecast(values, 3, horizon),
  },
  ses: {
    label: "Simple exponential smoothing",
    shortLabel: "Exp. smoothing",
    minMonths: MIN_MONTHS_FOR_FORECAST,
    run: (values, horizon) => computeExponentialSmoothingForecast(values, horizon),
  },
};

/**
 * How accurate `run` is when it forecasts the last `holdout` months from only
 * the months before them.
 *
 * Reports the four measures the three estimators are compared on:
 *   mae  - mean absolute error, in kWh
 *   rmse - root mean squared error; punishes the occasional large miss harder
 *   mape - mean absolute percentage error; scale-free, and what the ranking uses
 *   r2   - 1 - SSres/SStot against the mean of the held-out months
 *
 * Months with no reading (0 kWh) are skipped for MAPE, which has no meaning
 * against zero, but still count towards MAE, RMSE and R2.
 *
 * R2 is routinely negative on a short holdout: it compares the forecast with
 * "just predict the mean of the test months", and the mean is computed with
 * hindsight the forecaster did not have. A negative value is a real result, not
 * a bug, so it is reported as it comes out.
 */
function backtestMetrics(values, run, holdout) {
  const training = values.slice(0, values.length - holdout);
  const actual = values.slice(values.length - holdout);
  const predicted = run(training, holdout);

  if (!predicted || actual.length === 0) {
    return null;
  }

  let absTotal = 0;
  let squareTotal = 0;
  let percentTotal = 0;
  let percentCount = 0;

  actual.forEach((value, index) => {
    const error = predicted[index] - value;

    absTotal += Math.abs(error);
    squareTotal += error * error;

    if (value > 0) {
      percentTotal += Math.abs(error) / value;
      percentCount += 1;
    }
  });

  const mean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
  const spread = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);

  return {
    mae: absTotal / actual.length,
    rmse: Math.sqrt(squareTotal / actual.length),
    // Null rather than 0: "no month to measure against" is not "no error".
    mape: percentCount ? percentTotal / percentCount : null,
    // One held-out month has no spread to explain, so R2 is undefined for it.
    r2: spread > 0 ? 1 - squareTotal / spread : null,
  };
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
 * Size of the test window, as a 70% training / 30% test split of the series.
 *
 * Never large enough to drop training below MIN_MONTHS_FOR_FORECAST, and returns
 * 0 when the series is too short to hold anything back at all - at which point
 * nothing can be ranked and the moving average leads by default.
 */
export function getHoldoutMonths(n) {
  const maxHoldout = n - MIN_MONTHS_FOR_FORECAST;

  if (maxHoldout < 1) {
    return 0;
  }

  return Math.max(1, Math.min(maxHoldout, Math.round(n * 0.3)));
}

/**
 * Everything the Analytics forecast panel shows: each method's projection, how
 * accurate each one was when tested on the held-out months, and which one to
 * lead with.
 *
 * The leading method is whichever came closest on the test months when
 * forecasting them from the months before. That is a claim anyone can check,
 * unlike showing three disagreeing numbers with nothing to say which to believe.
 *
 * Returns null when there is not enough history to forecast responsibly.
 *
 * @returns {{
 *   series: Array<{ month, actual, average, wma, ses, isGap, isForecast }>,
 *   methods: Array<{ key, label, shortLabel, minMonths, available, projection, metrics, error }>,
 *   bestKey: string,
 *   testedMonths: number,
 *   baselineAverage: number,
 * } | null}
 */
export function buildForecastModel(points, horizon, buildFutureLabels) {
  const series = prepareForecastSeries(points);

  if (!series) {
    return null;
  }

  const values = series.map((point) => point.value);
  const n = values.length;

  // Every method is tested on the same held-out months so the errors compare.
  const testedMonths = getHoldoutMonths(n);

  const methods = Object.entries(FORECAST_METHODS).map(([key, method]) => {
    const projection = method.run(values, horizon);
    const isTestable = testedMonths > 0 && n - testedMonths >= method.minMonths;
    const metrics =
      projection && isTestable
        ? backtestMetrics(values, method.run, testedMonths)
        : null;

    return {
      key,
      label: method.label,
      shortLabel: method.shortLabel,
      minMonths: method.minMonths,
      available: Boolean(projection),
      projection: projection || null,
      metrics,
      // The ranking figure, kept under its old name so callers that only want
      // "how far off was it" need not reach into metrics.
      error: metrics ? metrics.mape : null,
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
    // Each estimate's first month is also written onto the last real month, so
    // its dashed line starts at the last bar instead of floating on its own.
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

  // Six months, not three. The direction indicator compares the forecast against
  // this, and every estimator is built from the last THREE months - so a
  // three-month baseline made the moving average compare a number with itself
  // and report "Steady" forever, even while consumption fell 11% across that
  // same stretch. The baseline has to be wider than the window the forecast is
  // drawn from, or the comparison carries no information.
  const baselineValues = values.slice(-6);

  return {
    series: historical.concat(upcoming),
    methods,
    bestKey: best.key,
    testedMonths: tested.length ? testedMonths : 0,
    baselineAverage:
      baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length,
  };
}

/**
 * Whether the leading estimate sits above or below the last six months of actual
 * consumption. Within 3% either way counts as steady.
 *
 * Six months is deliberate - see baselineValues in buildForecastModel. Compared
 * against the same three months every estimator is built from, this could only
 * ever return "Steady".
 *
 * @returns {{ label: "Rising" | "Falling" | "Steady", change: number }}
 */
export function getForecastDirection(model) {
  const best = model?.methods.find((method) => method.key === model.bestKey);

  if (!best?.projection?.length || !(model.baselineAverage > 0)) {
    return { label: "Steady", change: 0 };
  }

  const average =
    best.projection.reduce((sum, value) => sum + value, 0) / best.projection.length;
  const change = (average - model.baselineAverage) / model.baselineAverage;

  return {
    label: change > 0.03 ? "Rising" : change < -0.03 ? "Falling" : "Steady",
    change,
  };
}
