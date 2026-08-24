// Pure rate-limiting primitives for the ws layer. No IO and no clock reads —
// time arrives as an argument so tests stay deterministic (same discipline as
// the engine's Ctx).

/** Rolling-window hit counter (used for join-failure throttling). */
export class HitWindow {
  private hits: number[] = [];

  constructor(private windowMs: number) {}

  hit(at: number): void {
    this.hits.push(at);
  }

  /** Drop entries windowMs or older, then return the live count. */
  count(at: number): number {
    const cutoff = at - this.windowMs;
    this.hits = this.hits.filter((t) => t > cutoff);
    return this.hits.length;
  }

  reset(): void {
    this.hits = [];
  }
}

/** Drop every entry whose window has fully expired. IP-keyed HitWindow maps
 *  (failed joins) otherwise linger until that exact IP happens to send
 *  another join — an attacker churning source addresses (IPv6 ranges make
 *  them free) would grow the map without bound. Returns the removed count. */
export function sweepHitWindows<K>(
  windows: Map<K, HitWindow>,
  at: number
): number {
  let removed = 0;
  for (const [key, window] of windows) {
    if (window.count(at) === 0) {
      windows.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Token bucket for per-connection message limits: full capacity available as
 * a burst, refilling continuously at refillPerSecond. Clock is injected so
 * tests are deterministic.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillPerSecond: number,
    private now: () => number
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryTake(tokens = 1): boolean {
    this.refill();
    if (this.tokens < tokens) return false;
    this.tokens -= tokens;
    return true;
  }

  private refill(): void {
    const now = this.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }
}
