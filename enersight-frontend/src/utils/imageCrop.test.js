import { describe, expect, it } from "vitest";
import {
  FULL_CROP,
  MAX_UPLOAD_SIDE,
  getCropRect,
  getOutputSize,
  isCropped,
} from "./imageCrop";

describe("getCropRect", () => {
  it("maps a percent crop onto the image's own pixels", () => {
    expect(
      getCropRect({ unit: "%", x: 25, y: 10, width: 50, height: 20 }, 1536, 2048)
    ).toEqual({ x: 384, y: 205, width: 768, height: 410 });
  });

  it("keeps the whole image without a usable crop", () => {
    const whole = { x: 0, y: 0, width: 800, height: 600 };

    expect(getCropRect(null, 800, 600)).toEqual(whole);
    expect(getCropRect({ unit: "%", x: 10, y: 10, width: 0, height: 0 }, 800, 600)).toEqual(whole);
    expect(getCropRect({ unit: "px", x: 10, y: 10, width: 50, height: 50 }, 800, 600)).toEqual(whole);
    expect(getCropRect(FULL_CROP, 800, 600)).toEqual(whole);
  });

  it("never reaches outside the image", () => {
    const rect = getCropRect({ unit: "%", x: 90, y: 95, width: 30, height: 30 }, 1000, 1000);

    expect(rect.x + rect.width).toBeLessThanOrEqual(1000);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1000);
    expect(rect.width).toBeGreaterThan(0);
  });
});

describe("getOutputSize", () => {
  it("scales a full-size phone photo down to the upload limit", () => {
    expect(getOutputSize(3000, 4000)).toEqual({ width: 1536, height: MAX_UPLOAD_SIDE });
  });

  it("never scales a small crop up", () => {
    expect(getOutputSize(618, 352)).toEqual({ width: 618, height: 352 });
  });
});

describe("isCropped", () => {
  it("tells a real crop from the untouched full-image box", () => {
    expect(isCropped(FULL_CROP)).toBe(false);
    expect(isCropped(null)).toBe(false);
    expect(isCropped({ unit: "%", x: 20, y: 30, width: 40, height: 25 })).toBe(true);
  });
});
