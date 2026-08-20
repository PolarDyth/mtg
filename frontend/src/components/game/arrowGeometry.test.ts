// Pure math tests for the arrow overlay geometry.

import { describe, expect, it } from "vitest";
import { arrowPath, localCenter } from "./arrowGeometry";

describe("arrowPath", () => {
  it("bows consistently clockwise and lands the head on the target", () => {
    // rightward arrow: bow must push the control point down (y grows down)
    const { d, head, mid } = arrowPath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toBe("M 0 0 Q 50 15 100 0");
    // head tip at the target, base straddling the tangent
    expect(head).toContain("M 100 0");
    expect(head.split("L ")).toHaveLength(3);
    // midpoint sits on the bowed side, halfway along
    expect(mid).toEqual({ x: 50, y: 7.5 });
  });

  it("keeps the bow perpendicular for vertical arrows", () => {
    // downward arrow bows to the left (clockwise curl); 0.15·190 = 28.5
    const { d } = arrowPath({ x: 10, y: 10 }, { x: 10, y: 200 });
    expect(d).toBe("M 10 10 Q -18.5 105 10 200");
  });

  it("clamps the bow for long arrows and floors it for short ones", () => {
    const long = arrowPath({ x: 0, y: 0 }, { x: 1000, y: 0 });
    // dist 1000 → 0.15·dist = 150 → clamped to 48
    expect(long.d).toContain("Q 500 48");
    const short = arrowPath({ x: 0, y: 0 }, { x: 4, y: 0 });
    // dist 4 → floored at 12
    expect(short.d).toContain("Q 2 12");
  });

  it("never produces NaN for coincident points", () => {
    const { d, head, mid } = arrowPath({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(d).not.toContain("NaN");
    expect(head).not.toContain("NaN");
    expect(Number.isFinite(mid.x)).toBe(true);
  });

  it("shortens both ends along the direction so tips meet target edges", () => {
    const { d } = arrowPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 20);
    // start pulled 10px forward, end pulled 20px back; remaining 70px bow = 12
    expect(d).toBe("M 10 0 Q 45 12 80 0");
  });

  it("never shortens past the midpoint of a short arrow", () => {
    const { d } = arrowPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 500, 500);
    // both ends clamp to 4px in; the 2px line still bows the 12px floor
    expect(d).toBe("M 4 0 Q 5 12 6 0");
  });
});

describe("localCenter", () => {
  it("converts a viewport rect into container-local center coords", () => {
    // node test env has no DOMRect — localCenter only reads the four fields
    const rect = { left: 110, top: 60, width: 40, height: 20 } as DOMRect;
    const root = { left: 10, top: 10, width: 500, height: 400 } as DOMRect;
    expect(localCenter(rect, root)).toEqual({ x: 120, y: 60 });
  });
});
