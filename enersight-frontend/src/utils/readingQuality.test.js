import { describe, expect, it } from "vitest";
import {
  OCR_ACCURACY_THRESHOLD,
  formatOcrAccuracy,
  getAverageOcrAccuracy,
  getOcrScore,
  isHighOcrAccuracy,
  isLowOcrAccuracy,
  isManualReading,
} from "./readingQuality";

describe("getOcrScore", () => {
  it("treats a missing or zero score as a manual reading", () => {
    for (const value of [null, undefined, 0, "0", -4, "", "abc", NaN]) {
      expect(getOcrScore(value)).toBeNull();
    }
  });

  it("keeps a real score as a number", () => {
    expect(getOcrScore(93.5)).toBe(93.5);
    expect(getOcrScore("88")).toBe(88);
  });
});

describe("manual, low and high accuracy", () => {
  it("never counts a manual reading as low or high accuracy", () => {
    for (const reading of [{ ocr_accuracy: null }, { ocr_accuracy: 0 }, undefined]) {
      expect(isManualReading(reading)).toBe(true);
      expect(isLowOcrAccuracy(reading)).toBe(false);
      expect(isHighOcrAccuracy(reading)).toBe(false);
    }
  });

  it("splits photo readings at the 90% threshold", () => {
    expect(OCR_ACCURACY_THRESHOLD).toBe(90);
    expect(isLowOcrAccuracy({ ocr_accuracy: 89.9 })).toBe(true);
    expect(isLowOcrAccuracy({ ocr_accuracy: 90 })).toBe(false);
    expect(isHighOcrAccuracy({ ocr_accuracy: 90 })).toBe(true);
    expect(isManualReading({ ocr_accuracy: 90 })).toBe(false);
  });

  it("keeps typed-in readings out of the low-accuracy count", () => {
    // The demo data that exposed the bug: the page said 25 low-accuracy readings
    // when only 5 photos were under 90% and the other 20 were typed in.
    const readings = [
      ...Array.from({ length: 20 }, () => ({ ocr_accuracy: null })),
      ...Array.from({ length: 5 }, () => ({ ocr_accuracy: 85 })),
      ...Array.from({ length: 53 }, () => ({ ocr_accuracy: 95 })),
    ];

    expect(readings.filter(isLowOcrAccuracy)).toHaveLength(5);
    expect(readings.filter(isManualReading)).toHaveLength(20);
    expect(readings.filter(isHighOcrAccuracy)).toHaveLength(53);
  });
});

describe("getAverageOcrAccuracy", () => {
  it("averages scored readings only", () => {
    expect(
      getAverageOcrAccuracy([
        { ocr_accuracy: null },
        { ocr_accuracy: 80 },
        { ocr_accuracy: 100 },
      ])
    ).toBe(90);
  });

  it("returns null when nothing was scored", () => {
    expect(getAverageOcrAccuracy([])).toBeNull();
    expect(getAverageOcrAccuracy(undefined)).toBeNull();
    expect(
      getAverageOcrAccuracy([{ ocr_accuracy: 0 }, { ocr_accuracy: null }])
    ).toBeNull();
  });

  it("rounds to a whole percent", () => {
    expect(
      getAverageOcrAccuracy([{ ocr_accuracy: 80 }, { ocr_accuracy: 81 }])
    ).toBe(81);
  });
});

describe("formatOcrAccuracy", () => {
  it("labels manual readings instead of printing 0%", () => {
    expect(formatOcrAccuracy(null)).toBe("Manual");
    expect(formatOcrAccuracy(0)).toBe("Manual");
  });

  it("rounds scores to a whole percent", () => {
    expect(formatOcrAccuracy(93.4)).toBe("93%");
    expect(formatOcrAccuracy(93.5)).toBe("94%");
  });
});
