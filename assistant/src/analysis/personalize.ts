import type { BankOffer, MarketplaceId, RankedOffer } from "../domain/pricewise-types.js";
import type { SellerAssessment } from "./seller.js";

/**
 * Personal "best offer" ranking: the cheapest listing is often not the best one
 * for a particular buyer. This applies only the bank offers the buyer can use,
 * optional exchange value, and the buyer's own priorities.
 */

export interface UserCard {
  bank: string;
  cardType: "credit" | "debit";
}

export interface Priorities {
  price: number;
  delivery: number;
  returns: number;
  sellerTrust: number;
}

export const DEFAULT_PRIORITIES: Priorities = { price: 0.55, delivery: 0.15, returns: 0.1, sellerTrust: 0.2 };

export interface PersonalOffer {
  marketplaceId: MarketplaceId;
  sellerName: string;
  price: number;
  deliveryFee: number;
  applicableBankOffer: BankOffer | null;
  exchangeValueUsed: number;
  /** What this buyer pays out of pocket (after their own card offer and exchange). */
  yourPrice: number;
  deliveryDays: number;
  returnDays: number;
  sellerTrust: SellerAssessment["level"];
  emiPerMonth: number | null;
  score: number; // 0-100 under the buyer's priorities
  url: string;
  lastCheckedAt: string;
  dataSource: RankedOffer["dataSource"];
}

const normBank = (s: string) => s.toLowerCase().replace(/\b(bank|card|cards|ltd|limited)\b/g, "").replace(/[^a-z]/g, "");

/** True when the buyer's card qualifies for the offer (bank name match + card type). */
export function cardMatchesOffer(card: UserCard, offer: BankOffer): boolean {
  const a = normBank(card.bank);
  const b = normBank(offer.bank);
  if (!a || !b) return false;
  // "HDFC" matches "HDFC Bank". A co-branded offer ("Flipkart Axis Bank") needs
  // the co-branded card, so a plain Axis card does not get it; a co-branded card
  // ("Amazon Pay ICICI") still qualifies for its issuing bank's ("ICICI") offers.
  const bankOk = a === b || a.endsWith(b);
  return bankOk && (offer.cardType === "any" || offer.cardType === card.cardType);
}

export function bestOfferForCards(offers: BankOffer[], cards: UserCard[]): BankOffer | null {
  let best: BankOffer | null = null;
  for (const o of offers) {
    if (cards.some((c) => cardMatchesOffer(c, o)) && (!best || o.discount > best.discount)) best = o;
  }
  return best;
}

function normalisePriorities(p: Partial<Priorities> | undefined): Priorities {
  const merged = { ...DEFAULT_PRIORITIES, ...(p ?? {}) };
  const vals = Object.values(merged).map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return DEFAULT_PRIORITIES;
  return {
    price: Math.max(0, merged.price) / sum,
    delivery: Math.max(0, merged.delivery) / sum,
    returns: Math.max(0, merged.returns) / sum,
    sellerTrust: Math.max(0, merged.sellerTrust) / sum,
  };
}

const TRUST_SCORE: Record<SellerAssessment["level"], number> = { high: 1, medium: 0.6, low: 0.1 };

export interface PersonaliseInput {
  offers: RankedOffer[];
  sellerTrust: Map<RankedOffer, SellerAssessment>;
  cards: UserCard[];
  /** Exchange value the buyer expects for an old device (INR); capped at each store's exchangeUpTo. */
  exchangeValue?: number;
  priorities?: Partial<Priorities>;
  /** Deliver within this many days, else excluded. */
  maxDeliveryDays?: number;
}

export function personaliseOffers(input: PersonaliseInput): { ranked: PersonalOffer[]; excluded: { marketplaceId: MarketplaceId; reason: string }[] } {
  const w = normalisePriorities(input.priorities);
  const excluded: { marketplaceId: MarketplaceId; reason: string }[] = [];
  const candidates = input.offers.filter((o) => {
    if (!o.inStock) {
      excluded.push({ marketplaceId: o.marketplaceId, reason: "out of stock" });
      return false;
    }
    if (input.maxDeliveryDays !== undefined && o.deliveryDays > input.maxDeliveryDays) {
      excluded.push({ marketplaceId: o.marketplaceId, reason: `delivery takes ${o.deliveryDays} days` });
      return false;
    }
    return true;
  });

  const priced = candidates.map((o) => {
    const bank = bestOfferForCards(o.bankOffers, input.cards);
    const exchange = input.exchangeValue && o.exchangeUpTo ? Math.min(input.exchangeValue, o.exchangeUpTo) : 0;
    const yourPrice = Math.max(0, Math.round(o.price + o.deliveryFee - (bank?.discount ?? 0) - exchange));
    return { o, bank, exchange, yourPrice };
  });
  if (priced.length === 0) return { ranked: [], excluded };

  const prices = priced.map((p) => p.yourPrice);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const ranked = priced
    .map(({ o, bank, exchange, yourPrice }) => {
      const trust = input.sellerTrust.get(o)?.level ?? "medium";
      const priceScore = maxP === minP ? 1 : (maxP - yourPrice) / (maxP - minP);
      const deliveryScore = 1 - Math.min(1, o.deliveryDays / 10);
      const returnScore = Math.min(1, o.returnDays / 15);
      const score = w.price * priceScore + w.delivery * deliveryScore + w.returns * returnScore + w.sellerTrust * TRUST_SCORE[trust];
      return {
        marketplaceId: o.marketplaceId,
        sellerName: o.sellerName,
        price: o.price,
        deliveryFee: o.deliveryFee,
        applicableBankOffer: bank,
        exchangeValueUsed: exchange,
        yourPrice,
        deliveryDays: o.deliveryDays,
        returnDays: o.returnDays,
        sellerTrust: trust,
        emiPerMonth: o.emiPerMonth,
        score: Math.round(score * 100),
        url: o.url,
        lastCheckedAt: o.lastCheckedAt,
        dataSource: o.dataSource,
      } satisfies PersonalOffer;
    })
    .sort((a, b) => b.score - a.score || a.yourPrice - b.yourPrice);
  return { ranked, excluded };
}
