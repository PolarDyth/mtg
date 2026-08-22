import { describe, expect, it } from "vitest";
import { HitWindow } from "./ratelimit";

describe("HitWindow", () => {
  it("counts hits inside the window", () => {
    const w = new HitWindow(10_000);
    w.hit(0);
    w.hit(5_000);
    w.hit(9_999);
    expect(w.count(9_999)).toBe(3);
  });

  it("expires a hit exactly windowMs old", () => {
    const w = new HitWindow(10_000);
    w.hit(0);
    expect(w.count(10_000)).toBe(0);
  });

  it("prunes expired hits but keeps live ones", () => {
    const w = new HitWindow(10_000);
    w.hit(0);
    w.hit(9_999);
    expect(w.count(15_000)).toBe(1);
    expect(w.count(9_999 + 10_001)).toBe(0);
  });

  it("reset clears the window", () => {
    const w = new HitWindow(10_000);
    w.hit(1);
    w.reset();
    expect(w.count(1)).toBe(0);
  });
});
