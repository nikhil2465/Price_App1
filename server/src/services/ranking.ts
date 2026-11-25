import type { BankOffer, Offer, RankedOffer } from '../../../shared/types.js';

const WEIGHTS = { price: 0.6, delivery: 0.15, seller: 0.15, returns: 0.1 } as const;

export function bestBankOffer(offer: Offer): BankOffer | null {
  let best: BankOffer | null = null;
  for (const b of offer.bankOffers) if (!best || b.discount > best.discount) best = b;
  return best;
}

/** What the buyer actually pays: price + delivery − the single best bank discount (offers don't stack). */
export function effectivePrice(offer: Offer): number {
  const bank = bestBankOffer(offer);
  return Math.max(0, offer.price + offer.deliveryFee - (bank?.discount ?? 0));
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Ranks offers for one product. In-stock offers come first, ordered by effective price.
 * dealScore blends price (relative to the cheapest), delivery speed, seller rating and return window.
 */
export function rankOffers(offers: Offer[]): RankedOffer[] {
  const enriched = offers.map((o) => {
    const bank = bestBankOffer(o);
    return {
      ...o,
      bestBankOffer: bank,
      effectivePrice: effectivePrice(o),
      discountPercent: o.mrp > 0 ? Math.max(0, Math.round(((o.mrp - o.price) / o.mrp) * 100)) : 0,
    };
  });

  const inStock = enriched.filter((o) => o.inStock);
  const minEff = inStock.length ? Math.min(...inStock.map((o) => o.effectivePrice)) : 0;

  const scored = enriched.map((o) => {
    if (!o.inStock || minEff <= 0) return { ...o, dealScore: 0 };
    // 0% above cheapest → 1.0; 15%+ above → 0
    const priceScore = clamp01(1 - (o.effectivePrice - minEff) / minEff / 0.15);
    const deliveryScore = clamp01(1 - (o.deliveryDays - 1) / 6);
    const sellerScore = clamp01((o.sellerRating - 3) / 2);
    const returnScore = clamp01(o.returnDays / 30);
    const score =
      WEIGHTS.price * priceScore +
      WEIGHTS.delivery * deliveryScore +
      WEIGHTS.seller * sellerScore +
      WEIGHTS.returns * returnScore;
    return { ...o, dealScore: Math.round(score * 100) };
  });

  scored.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (a.effectivePrice !== b.effectivePrice) return a.effectivePrice - b.effectivePrice;
    return b.dealScore - a.dealScore;
  });

  const bestPriceId = scored.find((o) => o.inStock)?.marketplaceId;
  let bestDealId: string | undefined;
  let bestDealScore = -1;
  for (const o of scored) {
    if (o.inStock && o.dealScore > bestDealScore) {
      bestDealScore = o.dealScore;
      bestDealId = o.marketplaceId;
    }
  }

  return scored.map((o) => ({
    ...o,
    isBestPrice: o.marketplaceId === bestPriceId,
    isBestDeal: o.marketplaceId === bestDealId,
  }));
}
