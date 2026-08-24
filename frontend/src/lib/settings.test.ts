import { describe, expect, it } from "vitest";
import { clampPreviewPos } from "./settings";

describe("clampPreviewPos", () => {
  it("passes through positions already inside the viewport", () => {
    expect(clampPreviewPos(100, 200, 1920, 1080, 240, 350)).toEqual({ x: 100, y: 200 });
  });

  it("clamps negative positions to the margin", () => {
    expect(clampPreviewPos(-50, -999, 1920, 1080, 240, 350)).toEqual({ x: 8, y: 8 });
  });

  it("clamps positions past the right and bottom edges", () => {
    expect(clampPreviewPos(5000, 5000, 1920, 1080, 240, 350)).toEqual({
      x: 1920 - 240 - 8,
      y: 1080 - 350 - 8,
    });
  });

  it("keeps the panel reachable when the viewport is smaller than the panel", () => {
    expect(clampPreviewPos(500, 500, 200, 100, 240, 350)).toEqual({ x: 8, y: 8 });
  });

  it("rounds fractional coordinates", () => {
    expect(clampPreviewPos(10.6, 20.1, 1920, 1080, 240, 350)).toEqual({ x: 11, y: 20 });
  });

  it("maps non-finite coordinates to the margin instead of NaN", () => {
    expect(clampPreviewPos(Number.NaN, Number.POSITIVE_INFINITY, 1920, 1080, 240, 350)).toEqual({
      x: 8,
      y: 8,
    });
  });
});
