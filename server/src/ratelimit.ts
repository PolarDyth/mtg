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
