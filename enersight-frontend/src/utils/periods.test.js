import { describe, expect, it } from "vitest";
import {
  PERIOD_OPTIONS,
  formatPeriodLabel,
  getPeriodWindows,
  isInWindow,
  isInvalidCustomRange,
  parseDateInput,
} from "./periods";

// Local-time constructors throughout, so these pass in any timezone.
const at = (...parts) => new Date(...parts).getTime();
const NOW = new Date(2026, 8, 14, 10, 30); // 14 Sep 2026

describe("getPeriodWindows", () => {
  it("offers a custom range", () => {
    expect(PERIOD_OPTIONS).toContain("Custom Range");
  });

  it("has no limit for All Time", () => {
    expect(getPeriodWindows("All Time", "", "", NOW)).toEqual({
      current: null,
      previous: null,
      previousLabel: "",
    });
  });

  it("compares this month so far with the same stretch of last month", () => {
    const { current, previous, previousLabel } = getPeriodWindows("This Month", "", "", NOW);

    expect(current).toEqual({ start: at(2026, 8, 1), end: at(2026, 9, 1) });
    expect(previous).toEqual({
      start: at(2026, 7, 1),
      end: at(2026, 7, 1) + (NOW.getTime() - at(2026, 8, 1)),
    });
    expect(previousLabel).toBe("the same point last month");
  });

  it("never lets the comparison window run into the current month", () => {
    const endOfMarch = new Date(2026, 2, 31, 12);
    const { current, previous } = getPeriodWindows("This Month", "", "", endOfMarch);

    expect(previous.end).toBe(current.start);
  });

  it("compares last month with the month before", () => {
    expect(getPeriodWindows("Last Month", "", "", NOW)).toEqual({
      current: { start: at(2026, 7, 1), end: at(2026, 8, 1) },
      previous: { start: at(2026, 6, 1), end: at(2026, 7, 1) },
      previousLabel: "Jul 2026",
    });
  });

  it("rolls last month back across the new year", () => {
    const { current, previousLabel } = getPeriodWindows("Last Month", "", "", new Date(2026, 0, 10));

    expect(current).toEqual({ start: at(2025, 11, 1), end: at(2026, 0, 1) });
    expect(previousLabel).toBe("Nov 2025");
  });

  it("compares this year so far with the same stretch of last year", () => {
    const { current, previous, previousLabel } = getPeriodWindows("This Year", "", "", NOW);

    expect(current).toEqual({ start: at(2026, 0, 1), end: at(2027, 0, 1) });
    expect(previous.start).toBe(at(2025, 0, 1));
    expect(previous.end).toBe(at(2025, 0, 1) + (NOW.getTime() - at(2026, 0, 1)));
    expect(previousLabel).toBe("the same point last year");
  });

  it("includes both ends of a custom range and compares it with the days before", () => {
    const { current, previous, previousLabel } = getPeriodWindows(
      "Custom Range",
      "2026-08-01",
      "2026-08-31",
      NOW
    );
    const length = current.end - current.start;

    expect(current).toEqual({ start: at(2026, 7, 1), end: at(2026, 8, 1) });
    expect(previous).toEqual({ start: current.start - length, end: current.start });
    expect(previousLabel).toBe("the previous 31 days");
  });

  it("allows an open-ended custom range without a comparison", () => {
    expect(getPeriodWindows("Custom Range", "2026-08-01", "", NOW)).toEqual({
      current: { start: at(2026, 7, 1), end: Infinity },
      previous: null,
      previousLabel: "",
    });
    expect(getPeriodWindows("Custom Range", "", "2026-07-31", NOW).current).toEqual({
      start: -Infinity,
      end: at(2026, 7, 1),
    });
    expect(getPeriodWindows("Custom Range", "", "", NOW).current).toBeNull();
    expect(getPeriodWindows("Custom Range", "2026-08-31", "2026-08-01", NOW).previous).toBeNull();
  });
});

describe("isInWindow", () => {
  const august = { start: at(2026, 7, 1), end: at(2026, 8, 1) };

  it("includes the start and excludes the end", () => {
    expect(isInWindow(new Date(2026, 7, 1).toISOString(), august)).toBe(true);
    expect(isInWindow(new Date(2026, 7, 31, 23, 59).toISOString(), august)).toBe(true);
    expect(isInWindow(new Date(2026, 8, 1).toISOString(), august)).toBe(false);
  });

  it("accepts everything without a window, and nothing undated with one", () => {
    expect(isInWindow("", null)).toBe(true);
    expect(isInWindow("", august)).toBe(false);
    expect(isInWindow("not a date", august)).toBe(false);
  });

  it("supports open ends", () => {
    expect(isInWindow("1999-01-01", { start: -Infinity, end: at(2026, 7, 1) })).toBe(true);
    expect(isInWindow("2099-01-01", { start: at(2026, 7, 1), end: Infinity })).toBe(true);
  });
});

describe("parseDateInput", () => {
  it("reads a date input as local midnight", () => {
    expect(parseDateInput("2026-08-01")).toBe(at(2026, 7, 1));
    expect(parseDateInput("2026-08-31", 1)).toBe(at(2026, 8, 1));
  });

  it("returns null for empty or malformed input", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput("abc")).toBeNull();
  });
});

describe("custom range helpers", () => {
  it("flags a start date after the end date", () => {
    expect(isInvalidCustomRange("Custom Range", "2026-08-31", "2026-08-01")).toBe(true);
    expect(isInvalidCustomRange("Custom Range", "2026-08-01", "2026-08-01")).toBe(false);
    expect(isInvalidCustomRange("Custom Range", "2026-08-31", "")).toBe(false);
    expect(isInvalidCustomRange("This Month", "2026-08-31", "2026-08-01")).toBe(false);
  });

  it("prints the period for a report", () => {
    expect(formatPeriodLabel("Last Month", "", "")).toBe("Last Month");
    expect(formatPeriodLabel("Custom Range", "2026-08-01", "2026-08-31")).toBe(
      "Aug 1, 2026 – Aug 31, 2026"
    );
    expect(formatPeriodLabel("Custom Range", "2026-08-01", "")).toBe("From Aug 1, 2026");
    expect(formatPeriodLabel("Custom Range", "", "2026-08-31")).toBe("Up to Aug 31, 2026");
    expect(formatPeriodLabel("Custom Range", "", "")).toBe("All Time");
  });
});
