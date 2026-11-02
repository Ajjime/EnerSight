import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_SIDE, fitsUploadLimit, getOutputSize } from "./photoResize";

describe("getOutputSize", () => {
  it("scales a 12 MP phone photo down to the upload limit", () => {
    expect(getOutputSize(3024, 4032)).toEqual({ width: 1536, height: MAX_UPLOAD_SIDE });
  });

  it("keeps the aspect ratio of a landscape photo", () => {
    expect(getOutputSize(4000, 3000)).toEqual({ width: MAX_UPLOAD_SIDE, height: 1536 });
  });

  it("never scales a small photo up", () => {
    expect(getOutputSize(960, 534)).toEqual({ width: 960, height: 534 });
  });
});

describe("fitsUploadLimit", () => {
  it("sends photos at or under the limit as they are", () => {
    expect(fitsUploadLimit(1536, 2048)).toBe(true);
    expect(fitsUploadLimit(1014, 522)).toBe(true);
  });

  it("scales anything larger", () => {
    expect(fitsUploadLimit(3024, 4032)).toBe(false);
    expect(fitsUploadLimit(2049, 100)).toBe(false);
  });
});
