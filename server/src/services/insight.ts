import type { PriceInsight, PricePoint } from '../../../shared/types.js';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Summarises a multi-store price history into a buy/wait verdict.
 * Uses the cheapest store price on each day, so "90 day low" means the lowest price anywhere.
 */
export function buildInsight(history: PricePoint[], currentBest: number | null): PriceInsight {
  const dailyMin = new Map<string, number>();
  for (const p of history) {
    const prev = dailyMin.get(p.date);
    if (prev === undefined || p.price < prev) dailyMin.set(p.date, p.price);
  }
  const series = [...dailyMin.values()];
  if (series.length === 0 || currentBest === null) {
    return {
      lowest90d: currentBest ?? 0,
      highest90d: currentBest ?? 0,
      average90d: currentBest ?? 0,
      verdict: 'fair',
      advice: 'Not enough price history yet to judge this price.',
    };
  }
  const lowest = Math.min(...series, currentBest);
  const highest = Math.max(...series, currentBest);
  const average = Math.round(series.reduce((a, b) => a + b, 0) / series.length);
  const aboveLowPct = lowest > 0 ? ((currentBest - lowest) / lowest) * 100 : 0;

  let verdict: PriceInsight['verdict'];
  let advice: string;
  if (aboveLowPct <= 3) {
    verdict = 'great';
    advice =
      aboveLowPct < 0.5
        ? `Buy now: this is the lowest price in 90 days.`
        : `Buy now: only ${aboveLowPct.toFixed(1)}% above the 90 day low of ${inr(lowest)}.`;
  } else if (currentBest <= average) {
    verdict = 'fair';
    advice = `Fair price: below the 90 day average of ${inr(average)}, but it has dropped to ${inr(lowest)} before.`;
  } else {
    verdict = 'high';
    advice = `Consider waiting: ${aboveLowPct.toFixed(1)}% above the 90 day low of ${inr(lowest)}. Prices usually dip during sales.`;
  }
  return { lowest90d: lowest, highest90d: highest, average90d: average, verdict, advice };
}
