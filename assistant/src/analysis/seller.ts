import type { MarketplaceId, RankedOffer } from "../domain/pricewise-types.js";
import { formatInr, median } from "./pricing.js";

/**
 * Seller trust heuristic built only from fields the PriceWise contract has
 * (seller rating, return window, delivery, price vs other stores, retailer type).
 * It is a risk signal for the buyer, not a judgement about the seller, and the
 * assistant says so.
 */

/** Marketplaces that sell their own stock (first-party retail). */
const FIRST_PARTY_RETAILERS: ReadonlySet<MarketplaceId> = new Set(["croma", "reliance-digital", "vijay-sales", "nykaa"]);

const OFFICIAL_HINTS = ["official", "brand store", "world store", "center", "centre", "(boat)", "(minimalist)", "strauss"];

export type TrustLevel = "high" | "medium" | "low";

export interface SellerAssessment {
  marketplaceId: MarketplaceId;
  sellerName: string;
  score: number; // 0-100
  level: TrustLevel;
  positives: string[];
  risks: string[];
}

export const SELLER_RULES = {
  /** Price this far below the median of other in-stock stores is "too good to be true". */
  suspiciousPriceRatio: 0.85,
  lowRating: 3.8,
  goodRating: 4.3,
} as const;

export function assessSeller(offer: RankedOffer, allOffers: RankedOffer[], brand: string): SellerAssessment {
  const positives: string[] = [];
  const risks: string[] = [];
  let score = 50;

  const name = offer.sellerName.toLowerCase();
  const isFirstParty = FIRST_PARTY_RETAILERS.has(offer.marketplaceId) && name.includes(offer.marketplaceId.split("-")[0]!);
  const isOfficial = name.includes(brand.toLowerCase()) || OFFICIAL_HINTS.some((h) => name.includes(h));
  if (isFirstParty) {
    score += 20;
    positives.push(`Sold directly by ${offer.sellerName} (the retailer itself).`);
  } else if (isOfficial) {
    score += 15;
    positives.push(`${offer.sellerName} looks like the brand's official store.`);
  }

  if (offer.sellerRating >= SELLER_RULES.goodRating) {
    score += 15;
    positives.push(`Seller rating ${offer.sellerRating}/5.`);
  } else if (offer.sellerRating < SELLER_RULES.lowRating) {
    score -= 25;
    risks.push(`Low seller rating (${offer.sellerRating}/5).`);
  }

  if (offer.returnDays === 0) {
    score -= 15;
    risks.push("No returns accepted on this listing.");
  } else if (offer.returnDays >= 7) {
    score += 5;
    positives.push(`${offer.returnDays} day return/replacement window.`);
  }

  const others = allOffers.filter((o) => o !== offer && o.inStock && o.marketplaceId !== offer.marketplaceId).map((o) => o.price);
  if (others.length >= 2) {
    const med = median(others);
    if (offer.price < med * SELLER_RULES.suspiciousPriceRatio) {
      score -= 20;
      const below = Math.round((1 - offer.price / med) * 100);
      risks.push(`Price is ${below}% below the other stores (median ${formatInr(med)}): too good to be true is a common sign of grey-market, refurbished or counterfeit stock.`);
    }
  }

  if (offer.deliveryDays >= 6) {
    score -= 5;
    risks.push(`Slow delivery (${offer.deliveryDays} days) can mean the item ships from a third-party warehouse or abroad.`);
  }
  if (offer.dataSource === "sample") {
    // Not a risk of the seller; recorded so the assistant always labels it.
    risks.push("Sample data: seller details are illustrative, not live.");
  }

  score = Math.max(0, Math.min(100, score));
  const level: TrustLevel = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  return { marketplaceId: offer.marketplaceId, sellerName: offer.sellerName, score, level, positives, risks };
}
