import type { MarketplaceId, PricePoint, RankedOffer } from "../domain/pricewise-types.js";
import { formatInr, median } from "./pricing.js";

/**
 * Fake-discount detection: compares the discount a store *claims* (vs MRP)
 * with the discount the buyer *actually gets* (vs what the product really sold
 * for recently on that store). Heuristic thresholds are named constants so
 * they can be tuned against labelled data later.
 */

export const DISCOUNT_RULES = {
  /** MRP is "inflated" when it is this much above the highest price seen in the window. */
  inflatedMrpRatio: 1.25,
  /** A claimed discount at or above this % is "headline" sized. */
  headlineClaimPct: 20,
  /** A real saving at or above this % counts as genuine. */
  genuineRealPct: 5,
  /** A "real saving" at or below this % (i.e. paying more than usual) is flagged. */
  aboveUsualPct: -2,
  /** An MRP-based claim this large with an inflated MRP and no real saving is misleading. */
  extremeClaimPct: 50,
  /** Look-back window for a pre-sale hike (days before the last 2 days). */
  hikeWindowDays: 21,
  /** Prices this much above the earlier baseline inside the hike window count as a hike. */
  hikeRatio: 1.07,
  /** Need at least this many days of history to give a verdict. */
  minHistoryDays: 14,
} as const;

/**
 * genuine: real saving vs the usual price. modest: small real saving.
 * everyday_price: big "% off MRP" but this is the normal price. above_usual:
 * paying more than usual. misleading: price hiked before the sale, or an
 * extreme MRP-based claim with no real saving. unverified: too little history.
 */
export type DiscountVerdict = "genuine" | "modest" | "everyday_price" | "above_usual" | "misleading" | "unverified";

export interface DiscountAnalysis {
  marketplaceId: MarketplaceId;
  price: number;
  mrp: number;
  claimedDiscountPct: number;
  historyDays: number;
  median90d: number | null;
  highest90d: number | null;
  lowest90d: number | null;
  /** Saving vs the recent median selling price on this store (negative = paying more than usual). */
  realDiscountPct: number | null;
  mrpInflated: boolean;
  preSaleHike: { detected: boolean; peakPrice?: number; baselinePrice?: number; peakDate?: string };
  verdict: DiscountVerdict;
  reasons: string[];
}

const pct = (from: number, to: number) => (from > 0 ? Math.round(((from - to) / from) * 1000) / 10 : 0);

export function analyzeDiscount(offer: Pick<RankedOffer, "marketplaceId" | "price" | "mrp">, history: PricePoint[]): DiscountAnalysis {
  const series = history
    .filter((p) => p.marketplaceId === offer.marketplaceId)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Exclude today's point so "today" is judged against the past, not itself.
  const past = series.slice(0, -1).map((p) => p.price);
  const claimed = offer.mrp > 0 && offer.price < offer.mrp ? pct(offer.mrp, offer.price) : 0;
  const reasons: string[] = [];

  const base: Omit<DiscountAnalysis, "verdict" | "reasons"> = {
    marketplaceId: offer.marketplaceId,
    price: offer.price,
    mrp: offer.mrp,
    claimedDiscountPct: claimed,
    historyDays: past.length,
    median90d: null,
    highest90d: null,
    lowest90d: null,
    realDiscountPct: null,
    mrpInflated: false,
    preSaleHike: { detected: false },
  };

  if (past.length < DISCOUNT_RULES.minHistoryDays) {
    reasons.push(`Only ${past.length} days of price history on this store, too little to verify the discount.`);
    return { ...base, verdict: "unverified", reasons };
  }

  const med = median(past);
  const highest = Math.max(...past);
  const lowest = Math.min(...past);
  const real = pct(med, offer.price);
  const mrpInflated = offer.mrp > highest * DISCOUNT_RULES.inflatedMrpRatio && claimed >= DISCOUNT_RULES.headlineClaimPct;

  // Pre-sale hike: within the recent window (excluding the last 2 days) the price
  // was pushed clearly above the earlier baseline, and today's "sale" price is
  // not really below that earlier baseline.
  const w = DISCOUNT_RULES.hikeWindowDays;
  const recent = series.slice(-(w + 1), -2);
  const earlier = series.slice(0, -(w + 1)).map((p) => p.price);
  let preSaleHike: DiscountAnalysis["preSaleHike"] = { detected: false };
  if (earlier.length >= DISCOUNT_RULES.minHistoryDays && recent.length > 0) {
    const baseline = median(earlier);
    const peak = recent.reduce((a, b) => (b.price > a.price ? b : a));
    if (peak.price >= baseline * DISCOUNT_RULES.hikeRatio && offer.price >= baseline * 0.97) {
      preSaleHike = { detected: true, peakPrice: peak.price, baselinePrice: baseline, peakDate: peak.date };
    }
  }

  // Verdict order matters: active manipulation first, then real savings, then
  // "nothing special". A product that always sells far below its MRP is not a
  // scam by itself (that is its everyday price); it only becomes "misleading"
  // with a pre-sale hike or an extreme MRP-based claim with no real saving.
  let verdict: DiscountVerdict;
  if (preSaleHike.detected) {
    verdict = "misleading";
    reasons.push(
      `Price was raised to ${formatInr(preSaleHike.peakPrice ?? 0)} on ${preSaleHike.peakDate} versus a usual ${formatInr(preSaleHike.baselinePrice ?? 0)}; today's "sale" price is about the usual price, not a real saving.`,
    );
  } else if (real >= DISCOUNT_RULES.genuineRealPct) {
    verdict = "genuine";
    reasons.push(`${formatInr(offer.price)} is ${real}% below the usual ${formatInr(med)} on this store over the last ${past.length} days.`);
  } else if (real <= DISCOUNT_RULES.aboveUsualPct) {
    verdict = "above_usual";
    reasons.push(`Currently ${Math.abs(real)}% above the usual ${formatInr(med)} on this store, despite the "${claimed}% off" label.`);
  } else if (mrpInflated && claimed >= DISCOUNT_RULES.extremeClaimPct) {
    verdict = "misleading";
    reasons.push(
      `Claims ${claimed}% off an MRP of ${formatInr(offer.mrp)}, but it has not sold above ${formatInr(highest)} here in ${past.length} days. The real saving vs its usual ${formatInr(med)} is ${real}%.`,
    );
  } else if (claimed >= DISCOUNT_RULES.headlineClaimPct) {
    verdict = "everyday_price";
    reasons.push(
      `The "${claimed}% off" is measured from MRP, but ${formatInr(offer.price)} is about its usual price here (usual ${formatInr(med)}, real saving ${real}%). Fine to buy, just not a special deal.`,
    );
  } else {
    verdict = "modest";
    reasons.push(`A small saving: ${real}% below the usual ${formatInr(med)} on this store.`);
  }
  if (mrpInflated && verdict !== "misleading") {
    reasons.push(`MRP ${formatInr(offer.mrp)} is well above anything it sold for here recently (highest ${formatInr(highest)}), so ignore the % off MRP.`);
  }

  return { ...base, median90d: med, highest90d: highest, lowest90d: lowest, realDiscountPct: real, mrpInflated, preSaleHike, verdict, reasons };
}
