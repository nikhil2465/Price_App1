/**
 * Per-client token bucket. In-memory and per-instance: for several instances
 * behind a load balancer, enforce the global limit at the gateway or swap this
 * for a shared store (Redis) behind the same interface.
 */
export interface RateLimiter {
  /** Returns 0 if allowed, otherwise seconds until the next request is allowed. */
  take(key: string): number;
}

export class TokenBucketLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();
  private readonly refillPerMs: number;
  private lastSweep = Date.now();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 100_000,
  ) {
    this.refillPerMs = perMinute / 60_000;
  }

  take(key: string): number {
    const t = this.now();
    this.sweep(t);
    const b = this.buckets.get(key) ?? { tokens: this.perMinute, updated: t };
    b.tokens = Math.min(this.perMinute, b.tokens + (t - b.updated) * this.refillPerMs);
    b.updated = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.buckets.set(key, b);
      return 0;
    }
    this.buckets.set(key, b);
    return Math.ceil((1 - b.tokens) / this.refillPerMs / 1000);
  }

  /** Drops full (idle) buckets so memory stays bounded. */
  private sweep(t: number) {
    if (t - this.lastSweep < 60_000 && this.buckets.size < this.maxKeys) return;
    this.lastSweep = t;
    for (const [k, b] of this.buckets) {
      if (b.tokens + (t - b.updated) * this.refillPerMs >= this.perMinute) this.buckets.delete(k);
    }
    if (this.buckets.size >= this.maxKeys) this.buckets.clear();
  }
}
