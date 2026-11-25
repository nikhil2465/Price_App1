import { describe, expect, it } from 'vitest';
import type { PricePoint } from '../../shared/types.js';
import { buildInsight } from '../src/services/insight.js';

const pts = (prices: number[]): PricePoint[] =>
  prices.map((price, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, marketplaceId: 'amazon', price }));

describe('buildInsight', () => {
  it('says great near the 90 day low', () => {
    expect(buildInsight(pts([1100, 1000, 1200]), 1010).verdict).toBe('great');
  });
  it('says fair below average but above the low', () => {
    const i = buildInsight(pts([1000, 1300, 1300]), 1150);
    expect(i.verdict).toBe('fair');
    expect(i.average90d).toBe(1200);
  });
  it('says high above average', () => {
    expect(buildInsight(pts([1000, 1000, 1100]), 1200).verdict).toBe('high');
  });
  it('uses the cheapest store per day', () => {
    const h: PricePoint[] = [
      { date: '2026-01-01', marketplaceId: 'amazon', price: 1000 },
      { date: '2026-01-01', marketplaceId: 'flipkart', price: 900 },
    ];
    expect(buildInsight(h, 950).lowest90d).toBe(900);
  });
  it('degrades gracefully without data', () => {
    expect(buildInsight([], null).verdict).toBe('fair');
  });
});
