// Injectable randomness: crypto-backed in production, seedable in tests so
// shuffles and dice rolls are deterministic.

import { randomInt } from "node:crypto";

export interface Rng {
  /** Uniform float in [0, 1). */
  float(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export function systemRng(): Rng {
  return {
    float: () => randomInt(0, 2 ** 32) / 2 ** 32,
    int: (maxExclusive) => randomInt(0, maxExclusive),
  };
}

/** mulberry32 — small, fast, deterministic; for tests only. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const float = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    int: (maxExclusive) => Math.floor(float() * maxExclusive),
  };
}
