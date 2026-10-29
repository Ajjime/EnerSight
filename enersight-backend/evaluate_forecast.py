"""Measure how accurate the consumption forecasting actually is.

Why this exists
---------------
`evaluate_ocr.py` answers "how accurate is your OCR, and how did you measure it?"
with a number anyone can reproduce. The forecasting side had no such answer in the
repository: the comparison of Moving Average, Weighted Moving Average and Simple
Exponential Smoothing existed only as figures in the write-up, with no script to
regenerate them.

This produces those figures from the readings in your own database, using the same
three estimators and the same 70/30 split the system uses at runtime
(`enersight-frontend/src/utils/forecast.js`). Run it before a defense and the
numbers on the slide are the numbers the system will show.

What it measures
----------------
Monthly consumption per month is the sum of every reading's differential
(`reading_value - previous_reading`) in that month, which is exactly what the
Dashboard and Analytics pages chart. Months with no reading are kept as zero
rather than dropped, for the reason given in forecast.js: the consumption still
happened, it just landed in the next reading, so spreading it backwards would be
inventing readings nobody took.

Each estimator is trained on the first 70% of the months and scored on the last
30%, and every estimator is scored on the same held-out months so the errors
compare.

    MAE   mean absolute error, in kWh                     lower is better
    RMSE  root mean squared error, punishes large misses  lower is better
    MAPE  mean absolute percentage error                  lower is better
    R2    against predicting the mean of the test months  higher is better

R2 is routinely negative on a short test window: the mean it is compared against
is computed with hindsight the forecaster never had. A negative value is a real
result, not a bug.

Usage
-----
    python evaluate_forecast.py
    python evaluate_forecast.py --csv my_months.csv
    python evaluate_forecast.py --out eval_results

`--csv` takes a file with a header and one row per month, so the comparison can be
rerun on data that is not in this database:

    month,kwh
    2025-09,111600
    2025-10,100900
"""

import argparse
import csv
import math
import os
import sys
from collections import OrderedDict
from typing import Dict, List, Optional, Sequence


MIN_MONTHS_FOR_FORECAST = 3
SES_ALPHA = 0.3
TEST_FRACTION = 0.3


# ─── The three estimators, mirroring utils/forecast.js ────────────────────────


def moving_average(values: Sequence[float], horizon: int, window: int = 3) -> List[float]:
    """Mean of the last `window` months, projected flat."""
    if not values:
        return [0.0] * horizon

    size = min(window, len(values))
    mean = sum(values[-size:]) / size

    return [round(mean)] * horizon


def weighted_moving_average(
    values: Sequence[float], horizon: int, window: int = 3
) -> List[float]:
    """Same window, weighted 1..n so the newest month counts most."""
    if not values:
        return [0.0] * horizon

    size = min(window, len(values))
    recent = values[-size:]
    weighted = sum(value * (index + 1) for index, value in enumerate(recent))
    weight_total = size * (size + 1) / 2

    return [max(0.0, round(weighted / weight_total))] * horizon


def exponential_smoothing(
    values: Sequence[float], horizon: int, alpha: float = SES_ALPHA
) -> List[float]:
    """Level-only SES: S(t) = alpha*y(t) + (1-alpha)*S(t-1), carried forward flat."""
    if not values:
        return [0.0] * horizon

    level = values[0]

    for value in values[1:]:
        level = alpha * value + (1 - alpha) * level

    return [max(0.0, round(level))] * horizon


METHODS = OrderedDict(
    [
        ("Moving Average (MA)", moving_average),
        ("Weighted Moving Average (WMA)", weighted_moving_average),
        ("Simple Exponential Smoothing (SES)", exponential_smoothing),
    ]
)


# ─── Scoring ─────────────────────────────────────────────────────────────────


def holdout_months(n: int) -> int:
    """30% of the series, never cutting training below the minimum sample."""
    max_holdout = n - MIN_MONTHS_FOR_FORECAST

    if max_holdout < 1:
        return 0

    return max(1, min(max_holdout, round(n * TEST_FRACTION)))


def score(actual: Sequence[float], predicted: Sequence[float]) -> Dict[str, Optional[float]]:
    """MAE, RMSE, MAPE and R2 for one estimator over the held-out months."""
    abs_total = 0.0
    square_total = 0.0
    percent_total = 0.0
    percent_count = 0

    for value, guess in zip(actual, predicted):
        error = guess - value
        abs_total += abs(error)
        square_total += error * error

        # No percentage error against a month with nothing recorded.
        if value > 0:
            percent_total += abs(error) / value
            percent_count += 1

    mean = sum(actual) / len(actual)
    spread = sum((value - mean) ** 2 for value in actual)

    return {
        "mae": abs_total / len(actual),
        "rmse": math.sqrt(square_total / len(actual)),
        "mape": (percent_total / percent_count) if percent_count else None,
        "r2": (1 - square_total / spread) if spread > 0 else None,
    }


# ─── Loading months ──────────────────────────────────────────────────────────


def months_from_csv(path: str) -> "OrderedDict[str, float]":
    months: "OrderedDict[str, float]" = OrderedDict()

    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = (row.get("month") or "").strip()
            raw = (row.get("kwh") or "").strip()

            if not key:
                continue

            try:
                months[key] = float(raw)
            except ValueError:
                print(f"  skipping {key}: {raw!r} is not a number")

    return months


def months_from_database() -> "OrderedDict[str, float]":
    from app.database import SessionLocal
    from app.models import ConsumptionRecord

    db = SessionLocal()

    try:
        totals: Dict[str, float] = {}

        for record in db.query(ConsumptionRecord).all():
            if not record.reading_date:
                continue

            differential = float(record.reading_value or 0) - float(
                record.previous_reading or 0
            )
            key = f"{record.reading_date.year}-{record.reading_date.month:02d}"
            totals[key] = totals.get(key, 0.0) + differential

        return OrderedDict(sorted(totals.items()))
    finally:
        db.close()


def trim_empty_edges(months: "OrderedDict[str, float]") -> "OrderedDict[str, float]":
    """Drop leading and trailing months with nothing recorded.

    prepareForecastSeries in forecast.js trims the same way before filling gaps, so
    the series starts and ends on a real observation. Without this the script and
    the browser would score different months and disagree.
    """
    keys = list(months)
    first = next((i for i, key in enumerate(keys) if months[key] > 0), None)

    if first is None:
        return OrderedDict()

    last = max(i for i, key in enumerate(keys) if months[key] > 0)

    return OrderedDict((key, months[key]) for key in keys[first : last + 1])


def fill_month_gaps(months: "OrderedDict[str, float]") -> "OrderedDict[str, float]":
    """Insert missing calendar months as zero so the series is continuous."""
    if len(months) < 2:
        return months

    def to_index(key: str) -> int:
        year, month = key.split("-")
        return int(year) * 12 + int(month) - 1

    def to_key(index: int) -> str:
        return f"{index // 12}-{index % 12 + 1:02d}"

    keys = sorted(months, key=to_index)
    filled: "OrderedDict[str, float]" = OrderedDict()

    for index in range(to_index(keys[0]), to_index(keys[-1]) + 1):
        key = to_key(index)
        filled[key] = months.get(key, 0.0)

    return filled


# ─── Reporting ───────────────────────────────────────────────────────────────


def fmt(value: Optional[float], places: int = 2) -> str:
    return "—" if value is None else f"{value:,.{places}f}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compare MA, WMA and SES on this system's monthly consumption."
    )
    parser.add_argument(
        "--csv", help="Score a month,kwh CSV instead of reading the database."
    )
    parser.add_argument(
        "--out", default="eval_results", help="Where to write the result files."
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=SES_ALPHA,
        help=f"Smoothing constant for SES (default {SES_ALPHA}).",
    )
    args = parser.parse_args()

    if args.csv:
        if not os.path.exists(args.csv):
            print(f"No CSV at {args.csv}.")
            return 1
        months = months_from_csv(args.csv)
        source = args.csv
    else:
        months = months_from_database()
        source = "the consumption_records table"

    months = trim_empty_edges(months)
    months = fill_month_gaps(months)
    keys = list(months)
    values = [months[key] for key in keys]
    n = len(values)

    if n < MIN_MONTHS_FOR_FORECAST + 1:
        print(
            f"Only {n} month(s) of consumption in {source}. "
            f"At least {MIN_MONTHS_FOR_FORECAST + 1} are needed to hold any back."
        )
        return 1

    test_size = holdout_months(n)
    train, test = values[: n - test_size], values[n - test_size :]
    test_keys = keys[n - test_size :]

    print(f"Monthly consumption from {source}")
    print(f"{n} month(s): {keys[0]} to {keys[-1]}")
    # Reported as it actually falls: 30% of 12 months is 3.6, and the nearest whole
    # month is 4, so the real split is 67/33 rather than exactly 70/30.
    print(
        f"{len(train)} training / {test_size} test months - nearest whole-month "
        f"split to {100 - round(TEST_FRACTION * 100)}/{round(TEST_FRACTION * 100)}, "
        f"here {round(len(train) / n * 100)}/{round(test_size / n * 100)}\n"
    )

    def run(name: str, fn):
        if name.startswith("Simple"):
            return fn(train, test_size, args.alpha)
        return fn(train, test_size)

    results = {name: run(name, fn) for name, fn in METHODS.items()}
    scores = {name: score(test, predicted) for name, predicted in results.items()}

    # Per-month actual vs predicted, the table behind the comparison chart.
    header = f"{'Month':<10}{'Actual':>14}" + "".join(
        f"{name.split('(')[1].rstrip(')'):>14}" for name in METHODS
    )
    print(header)
    print("-" * len(header))

    for index, key in enumerate(test_keys):
        row = f"{key:<10}{test[index]:>14,.0f}"
        for name in METHODS:
            row += f"{results[name][index]:>14,.0f}"
        print(row)

    print(f"\n{'Algorithm':<36}{'MAE':>14}{'RMSE':>14}{'MAPE':>10}{'R2':>9}")
    print("-" * 83)

    ranked = sorted(
        scores.items(),
        key=lambda item: (item[1]["mape"] is None, item[1]["mape"] or 0),
    )

    for name, metrics in scores.items():
        mape = "—" if metrics["mape"] is None else f"{metrics['mape'] * 100:,.2f}%"
        print(
            f"{name:<36}{fmt(metrics['mae']):>14}{fmt(metrics['rmse']):>14}"
            f"{mape:>10}{fmt(metrics['r2']):>9}"
        )

    best = ranked[0][0]
    print(f"\nLowest MAPE: {best}")
    print(
        "This is the same comparison the Analytics page runs in the browser, so the\n"
        "leading estimate shown there should agree with this table."
    )

    os.makedirs(args.out, exist_ok=True)
    out_path = os.path.join(args.out, "forecast_metrics.csv")

    with open(out_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["algorithm", "mae", "rmse", "mape", "r2", "test_months"])
        for name, metrics in scores.items():
            writer.writerow(
                [
                    name,
                    round(metrics["mae"], 4),
                    round(metrics["rmse"], 4),
                    "" if metrics["mape"] is None else round(metrics["mape"], 6),
                    "" if metrics["r2"] is None else round(metrics["r2"], 6),
                    test_size,
                ]
            )

    months_path = os.path.join(args.out, "forecast_per_month.csv")

    with open(months_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["month", "actual"] + list(METHODS))
        for index, key in enumerate(test_keys):
            writer.writerow(
                [key, test[index]] + [results[name][index] for name in METHODS]
            )

    print(f"\nWrote {out_path} and {months_path}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
