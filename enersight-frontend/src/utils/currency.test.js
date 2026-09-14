import { describe, expect, it } from "vitest";
import { applianceKwhMonth, formatPeso } from "./currency";

describe("applianceKwhMonth", () => {
  it("is watts × quantity × hours per day × days per month ÷ 1000", () => {
    expect(
      applianceKwhMonth({ wattage: 1500, quantity: 3, hours_per_day: 8, days_per_month: 22 })
    ).toBe(792);
  });

  it("accepts the numeric strings form inputs produce", () => {
    expect(
      applianceKwhMonth({ wattage: "40", quantity: "50", hours_per_day: "10", days_per_month: "22" })
    ).toBe(440);
  });

  it("treats missing or invalid fields as zero", () => {
    expect(applianceKwhMonth({ wattage: 1500, quantity: 3 })).toBe(0);
    expect(
      applianceKwhMonth({ wattage: "abc", quantity: 1, hours_per_day: 1, days_per_month: 1 })
    ).toBe(0);
  });
});

describe("formatPeso", () => {
  it("groups thousands with two decimals by default", () => {
    expect(formatPeso(3225.6)).toBe("₱3,225.60");
  });

  it("can drop the decimals", () => {
    expect(formatPeso(1480104.4, { decimals: 0 })).toBe("₱1,480,104");
  });

  it("falls back to zero for anything that is not a number", () => {
    expect(formatPeso("abc")).toBe("₱0.00");
  });
});
