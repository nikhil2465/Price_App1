import type {
  BankOffer,
  Offer,
  PriceInsight,
  PricePoint,
  RankedOffer,
} from "../domain/pricewise-types.js";

/**
 * Deterministic price maths. The model never does arithmetic on prices on its
 * own: every number it quotes comes from these functions (or from the
 * PriceWise API, which applies the same definitions).
 */

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** "₹1,24,999": Indian digit grouping for every amount the assistant shows. */
export function formatInr(amount: number): string {
  return `₹${INR.format(Math.round(amount))}`;
}

export function bestBankOffer(offers: BankOffer[]): BankOffer | null {
  let best: BankOffer | null = null;
  for (const o of offers) if (o.discount > 0 && (!best || o.discount > best.discount)) best = o;
  return best;
}

/** Contract definition: price + deliveryFee - best single bank discount, never below 0. */
export function effectivePrice(offer: Pick<Offer, "price" | "deliveryFee" | "bankOffers">): number {
  const bank = bestBankOffer(offer.bankOffers);
  return Math.max(0, Math.round(offer.price + offer.deliveryFee - (bank?.discount ?? 0)));
}

export function discountPercent(price: number, mrp: number): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Ranks offers with the sample-catalogue deal score (0-100): 50% effective
 * price (relative to the other in-stock offers), 20% seller rating, 15% delivery
 * speed, 15% return window. Out-of-stock offers score 0 and are never "best".
 */
export function rankOffers(offers: Offer[]): RankedOffer[] {
  const enriched = offers.map((o) => ({
    ...o,
    effectivePrice: effectivePrice(o),
    bestBankOffer: bestBankOffer(o.bankOffers),
    discountPercent: discountPercent(o.price, o.mrp),
  }));
  const inStock = enriched.filter((o) => o.inStock);
  const effs = inStock.map((o) => o.effectivePrice);
  const minEff = effs.length ? Math.min(...effs) : 0;
  const maxEff = effs.length ? Math.max(...effs) : 0;

  const scored = enriched.map((o) => {
    if (!o.inStock) return { ...o, dealScore: 0 };
    const priceScore = maxEff === minEff ? 1 : (maxEff - o.effectivePrice) / (maxEff - minEff);
    const deliveryScore = 1 - clamp01(o.deliveryDays / 10);
    const sellerScore = clamp01(o.sellerRating / 5);
    const returnScore = clamp01(o.returnDays / 30);
    const score = 0.5 * priceScore + 0.2 * sellerScore + 0.15 * deliveryScore + 0.15 * returnScore;
    return { ...o, dealScore: Math.round(score * 100) };
  });

  const bestPriceOffer = scored
    .filter((o) => o.inStock)
    .reduce<(typeof scored)[number] | null>((b, o) => (!b || o.effectivePrice < b.effectivePrice ? o : b), null);
  const bestDealOffer = scored
    .filter((o) => o.inStock)
    .reduce<(typeof scored)[number] | null>((b, o) => (!b || o.dealScore > b.dealScore ? o : b), null);

  return scored
    .map((o) => ({ ...o, isBestPrice: o === bestPriceOffer, isBestDeal: o === bestDealOffer }))
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.effectivePrice - b.effectivePrice);
}

/** Lowest selling price per day across all marketplaces (bank offers excluded). */
export function dailyBestPrices(history: PricePoint[]): { date: string; price: number }[] {
  const byDate = new Map<string, number>();
  for (const p of history) {
    const cur = byDate.get(p.date);
    if (cur === undefined || p.price < cur) byDate.set(p.date, p.price);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, price]) => ({ date, price }));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export function buildInsight(history: PricePoint[], currentBestPrice: number): PriceInsight {
  const daily = dailyBestPrices(history).map((d) => d.price);
  if (daily.length === 0) {
    return {
      lowest90d: currentBestPrice,
      highest90d: currentBestPrice,
      average90d: currentBestPrice,
      verdict: "fair",
      advice: "Not enough price history yet to judge whether this is a good time to buy.",
    };
  }
  const lowest = Math.min(...daily, currentBestPrice);
  const highest = Math.max(...daily);
  const average = Math.round(daily.reduce((a, b) => a + b, 0) / daily.length);
  const aboveLowPct = lowest > 0 ? ((currentBestPrice - lowest) / lowest) * 100 : 0;
  let verdict: PriceInsight["verdict"];
  let advice: string;
  if (aboveLowPct <= 3) {
    verdict = "great";
    advice = aboveLowPct < 0.5 ? "Buy now: this is the 90 day low." : `Buy now: within ${aboveLowPct.toFixed(0)}% of the 90 day low.`;
  } else if (currentBestPrice <= average) {
    verdict = "fair";
    advice = `Fair price: below the 90 day average, but ${aboveLowPct.toFixed(0)}% above the 90 day low.`;
  } else {
    verdict = "high";
    advice = `Consider waiting: ${aboveLowPct.toFixed(0)}% above the 90 day low and above the 90 day average.`;
  }
  return { lowest90d: lowest, highest90d: highest, average90d: average, verdict, advice };
}
