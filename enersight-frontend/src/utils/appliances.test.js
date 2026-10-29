import { describe, expect, it } from "vitest";
import {
  EMPTY_APPLIANCE_FORM,
  isApplianceDraftStarted,
  validateApplianceForm,
} from "./appliances";

const aircon = {
  name: "  Aircon (1.5 HP) ",
  category: "Cooling",
  wattage: "1120",
  quantity: "2",
  hours_per_day: "8",
  days_per_month: "22",
};

describe("validateApplianceForm", () => {
  it("returns a payload with numbers and a trimmed name", () => {
    expect(validateApplianceForm(aircon)).toEqual({
      payload: {
        name: "Aircon (1.5 HP)",
        category: "Cooling",
        wattage: 1120,
        quantity: 2,
        hours_per_day: 8,
        days_per_month: 22,
      },
    });
  });

  it("names the first field that is wrong", () => {
    const cases = [
      [{ name: " " }, /name/],
      [{ wattage: "" }, /wattage/],
      [{ wattage: "0" }, /wattage/],
      [{ hours_per_day: "" }, /hours/],
      [{ hours_per_day: "30" }, /more than 24/],
      [{ quantity: "0" }, /Quantity/],
      [{ quantity: "-5" }, /Quantity/],
      [{ quantity: "1.5" }, /Quantity/],
      [{ days_per_month: "32" }, /Days per month/],
      [{ days_per_month: "0" }, /Days per month/],
    ];

    for (const [change, message] of cases) {
      const result = validateApplianceForm({ ...aircon, ...change });

      expect(result.payload).toBeUndefined();
      expect(result.error).toMatch(message);
    }
  });

  it("allows an appliance that is switched off (0 hours)", () => {
    expect(validateApplianceForm({ ...aircon, hours_per_day: "0" }).payload.hours_per_day).toBe(0);
  });
});

describe("isApplianceDraftStarted", () => {
  it("ignores the defaults an empty form starts with", () => {
    expect(isApplianceDraftStarted(EMPTY_APPLIANCE_FORM)).toBe(false);
  });

  it("notices a half-typed appliance", () => {
    expect(isApplianceDraftStarted({ ...EMPTY_APPLIANCE_FORM, name: "Fan" })).toBe(true);
    expect(isApplianceDraftStarted({ ...EMPTY_APPLIANCE_FORM, wattage: "75" })).toBe(true);
  });
});
