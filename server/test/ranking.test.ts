import { describe, expect, it } from 'vitest';
import type { Offer } from '../../shared/types.js';
import { effectivePrice, rankOffers } from '../src/services/ranking.js';

const base: Offer = {
  productId: 'p',
  marketplaceId: 'amazon',
  price: 10000,
  mrp: 12000,
  inStock: true,
  deliveryDays: 2,
  deliveryFee: 0,
  sellerName: 's',
  sellerRating: 4.5,
  returnDays: 7,
  emiPerMonth: null,
  bankOffers: [],
  exchangeUpTo: null,
  url: 'https://example.com',
  lastCheckedAt: new Date(0).toISOString(),
  dataSource: 'sample',
};

describe('effectivePrice', () => {
  it('adds delivery and subtracts only the single best bank discount', () => {
    const o: Offer = {
      ...base,
      deliveryFee: 49,
      bankOffers: [
        { bank: 'A', cardType: 'credit', description: '', discount: 500 },
        { bank: 'B', cardType: 'credit', description: '', discount: 1200 },
      ],
    };
    expect(effectivePrice(o)).toBe(10000 + 49 - 1200);
  });
  it('never goes below zero', () => {
    expect(effectivePrice({ ...base, price: 100, bankOffers: [{ bank: 'A', cardType: 'any', description: '', discount: 500 }] })).toBe(0);
  });
});

describe('rankOffers', () => {
  it('ranks by effective price, puts out-of-stock last, and flags best price/deal', () => {
    const ranked = rankOffers([
      { ...base, marketplaceId: 'amazon', price: 10500 },
      { ...base, marketplaceId: 'flipkart', price: 10000, bankOffers: [{ bank: 'H', cardType: 'credit', description: '', discount: 1000 }] },
      { ...base, marketplaceId: 'croma', price: 8000, inStock: false },
    ]);
    expect(ranked.map((o) => o.marketplaceId)).toEqual(['flipkart', 'amazon', 'croma']);
    expect(ranked[0]!.isBestPrice).toBe(true);
    expect(ranked[0]!.isBestDeal).toBe(true);
    expect(ranked[2]!.dealScore).toBe(0);
    expect(ranked[2]!.isBestPrice).toBe(false);
    expect(ranked[1]!.discountPercent).toBe(13);
  });
  it('handles an empty list and all-out-of-stock lists', () => {
    expect(rankOffers([])).toEqual([]);
    const r = rankOffers([{ ...base, inStock: false }]);
    expect(r[0]!.isBestPrice).toBe(false);
    expect(r[0]!.isBestDeal).toBe(false);
  });
});
