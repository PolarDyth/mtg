import { describe, expect, it } from "vitest";
import { HitWindow, sweepHitWindows, TokenBucket } from "./ratelimit";

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

describe("sweepHitWindows", () => {
  it("deletes fully-expired entries and keeps live ones", () => {
    const windows = new Map<string, HitWindow>();
    const stale = new HitWindow(60_000);
    stale.hit(0); // expired by t=60_000
    const live = new HitWindow(60_000);
    live.hit(30_000); // still inside the window at t=60_000
    windows.set("2001:db8::1", stale);
    windows.set("203.0.113.7", live);

    expect(sweepHitWindows(windows, 60_000)).toBe(1);
    expect(windows.has("2001:db8::1")).toBe(false);
    expect(windows.has("203.0.113.7")).toBe(true);
  });

  it("bounds memory: every entry is gone within windowMs of its last hit", () => {
    const windows = new Map<string, HitWindow>();
    for (let i = 0; i < 1000; i++) {
      const w = new HitWindow(60_000);
      w.hit(i); // each IP's only hit at its own connect time
      windows.set(`198.51.100.${i % 256}:${i}`, w);
    }
    sweepHitWindows(windows, 1_000 + 60_000);
    expect(windows.size).toBe(0);
  });

  it("handles an empty map", () => {
    expect(sweepHitWindows(new Map(), 0)).toBe(0);
  });
});

describe("TokenBucket", () => {
  function bucket(capacity = 30, rate = 10) {
    let now = 1_000_000;
    return { b: new TokenBucket(capacity, rate, () => now), tick: (ms: number) => (now += ms) };
  }

  it("allows a burst up to capacity, then denies", () => {
    const { b } = bucket(30, 10);
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (b.tryTake()) allowed++;
    expect(allowed).toBe(30);
  });

  it("refills continuously at the configured rate", () => {
    const { b, tick } = bucket(30, 10);
    for (let i = 0; i < 30; i++) expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
    tick(500); // 10/s → 5 tokens back
    let allowed = 0;
    for (let i = 0; i < 10; i++) if (b.tryTake()) allowed++;
    expect(allowed).toBe(5);
  });

  it("never refills past capacity", () => {
    const { b, tick } = bucket(30, 10);
    tick(60_000);
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (b.tryTake()) allowed++;
    expect(allowed).toBe(30);
  });

  it("recovers fully after a long idle", () => {
    const { b, tick } = bucket(5, 1);
    for (let i = 0; i < 5; i++) expect(b.tryTake()).toBe(true);
    tick(5_000);
    expect(b.tryTake()).toBe(true);
  });
});
