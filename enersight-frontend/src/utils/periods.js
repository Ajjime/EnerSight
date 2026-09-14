// Date windows behind the period filters on Analytics and Reports.
//
// Both pages used to carry their own isReadingInPeriod with only the four fixed
// periods. This is the one copy, with the custom range and the earlier window each
// period is compared against for "vs previous" figures.

export const PERIOD_OPTIONS = [
  "All Time",
  "This Month",
  "Last Month",
  "This Year",
  "Custom Range",
];

const DAY_MS = 86400000;

/** "YYYY-MM-DD" from a date input -> local midnight in ms, plus `dayOffset` days. */
export function parseDateInput(value, dayOffset = 0) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + dayOffset).getTime();
}

function formatMonthYear(time) {
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatDay(time) {
  return new Date(time).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The selected date window and the window it is compared against. Times are epoch
 * milliseconds, start inclusive and end exclusive; `current: null` means no limit.
 *
 * Partial periods compare like with like: this month so far against the same
 * number of days at the start of last month, not against all of last month.
 *
 * `now` is only a parameter so tests can pin the date.
 */
export function getPeriodWindows(period, customFrom, customTo, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "This Month" || period === "This Year") {
    const isMonth = period === "This Month";
    const start = (isMonth ? new Date(year, month, 1) : new Date(year, 0, 1)).getTime();
    const end = (isMonth ? new Date(year, month + 1, 1) : new Date(year + 1, 0, 1)).getTime();
    const previousStart = (
      isMonth ? new Date(year, month - 1, 1) : new Date(year - 1, 0, 1)
    ).getTime();

    return {
      current: { start, end },
      previous: {
        start: previousStart,
        // Capped at the current start: on 31 March, "the same point" in February
        // would otherwise run past the end of February into March itself.
        end: Math.min(previousStart + (now.getTime() - start), start),
      },
      previousLabel: isMonth ? "the same point last month" : "the same point last year",
    };
  }

  if (period === "Last Month") {
    const start = new Date(year, month - 1, 1).getTime();
    const previousStart = new Date(year, month - 2, 1).getTime();

    return {
      current: { start, end: new Date(year, month, 1).getTime() },
      previous: { start: previousStart, end: start },
      previousLabel: formatMonthYear(previousStart),
    };
  }

  if (period === "Custom Range") {
    const from = parseDateInput(customFrom);
    // The "to" day is inclusive, so the window runs to the start of the next day.
    const to = parseDateInput(customTo, 1);

    if (from === null && to === null) {
      return { current: null, previous: null, previousLabel: "" };
    }

    const current = { start: from ?? -Infinity, end: to ?? Infinity };

    if (from === null || to === null || to <= from) {
      return { current, previous: null, previousLabel: "" };
    }

    const length = to - from;
    const days = Math.round(length / DAY_MS);

    return {
      current,
      previous: { start: from - length, end: from },
      previousLabel: `the previous ${days} day${days === 1 ? "" : "s"}`,
    };
  }

  return { current: null, previous: null, previousLabel: "" };
}

export function isInWindow(readingDate, window) {
  if (!window) return true;
  if (!readingDate) return false;
  const time = new Date(readingDate).getTime();
  return Number.isFinite(time) && time >= window.start && time < window.end;
}

/** A custom range whose start is after its end. Both inputs are "YYYY-MM-DD". */
export function isInvalidCustomRange(period, customFrom, customTo) {
  return (
    period === "Custom Range" &&
    Boolean(customFrom) &&
    Boolean(customTo) &&
    customFrom > customTo
  );
}

/** Period as printed on a report: the fixed name, or "Aug 1, 2026 – Aug 31, 2026". */
export function formatPeriodLabel(period, customFrom, customTo) {
  if (period !== "Custom Range") return period;

  const from = parseDateInput(customFrom);
  const to = parseDateInput(customTo);

  if (from === null && to === null) return "All Time";
  if (from === null) return `Up to ${formatDay(to)}`;
  if (to === null) return `From ${formatDay(from)}`;
  return `${formatDay(from)} – ${formatDay(to)}`;
}
