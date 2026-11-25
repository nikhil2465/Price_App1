/** Deterministic hashing and PRNG so sample data is stable across restarts and tests. */

export function hashString(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: small, fast, good-enough PRNG for synthetic data. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round a rupee amount to a retail-looking price ending in 9 (e.g. 54,999). */
export function retailRound(value: number): number {
  if (value < 1000) return Math.max(9, Math.round(value / 10) * 10 - 1);
  return Math.round(value / 100) * 100 - 1;
}
