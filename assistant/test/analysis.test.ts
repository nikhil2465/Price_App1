import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDiscount } from "../src/analysis/discount.js";
import { assessSeller } from "../src/analysis/seller.js";
import { bestOfferForCards, cardMatchesOffer, personaliseOffers } from "../src/analysis/personalize.js";
import { buildInsight, effectivePrice, rankOffers } from "../src/analysis/pricing.js";
import type { PricePoint } from "../src/domain/pricewise-types.js";
import { sampleCatalog } from "./helpers.js";

const catalog = sampleCatalog();

async function load(id: string) {
  const detail = await catalog.getProduct(id);
  const history = await catalog.getPriceHistory(id, 90);
  assert.ok(detail && history, `sample product ${id} exists`);
  return { detail, history };
}

test("effective price = price + delivery - best single bank offer, never negative", () => {
  const offers = [
    { bank: "HDFC Bank", cardType: "credit" as const, description: "", discount: 4000 },
    { bank: "ICICI Bank", cardType: "any" as const, description: "", discount: 2500 },
  ];
  assert.equal(effectivePrice({ price: 70000, deliveryFee: 99, bankOffers: offers }), 66099);
  assert.equal(effectivePrice({ price: 100, deliveryFee: 0, bankOffers: [{ ...offers[0]!, discount: 500 }] }), 0);
  assert.equal(effectivePrice({ price: 500, deliveryFee: 40, bankOffers: [] }), 540);
});

test("rankOffers marks exactly one in-stock best price and best deal; out of stock never best", async () => {
  const { detail } = await load("jbl-tune-770nc");
  const ranked = rankOffers(detail.offers);
  assert.equal(ranked.filter((o) => o.isBestPrice).length, 1);
  assert.equal(ranked.filter((o) => o.isBestDeal).length, 1);
  const croma = ranked.find((o) => o.marketplaceId === "croma")!;
  assert.equal(croma.inStock, false);
  assert.equal(croma.isBestPrice, false, "cheapest listing is out of stock so it cannot be best price");
  assert.equal(croma.dealScore, 0);
});

test("inflated MRP is flagged as a misleading discount (boAt Airdopes: 75% 'off')", async () => {
  const { detail, history } = await load("boat-airdopes-141");
  const amazon = detail.offers.find((o) => o.marketplaceId === "amazon")!;
  const a = analyzeDiscount(amazon, history);
  assert.ok(a.claimedDiscountPct > 70);
  assert.equal(a.mrpInflated, true);
  assert.equal(a.verdict, "misleading");
});

test("price raised before a sale is detected (Galaxy S25 on Flipkart)", async () => {
  const { detail, history } = await load("samsung-galaxy-s25-256gb");
  const fk = detail.offers.find((o) => o.marketplaceId === "flipkart")!;
  const a = analyzeDiscount(fk, history);
  assert.equal(a.preSaleHike.detected, true);
  assert.equal(a.verdict, "misleading");
  const amazon = detail.offers.find((o) => o.marketplaceId === "amazon")!;
  const b = analyzeDiscount(amazon, history);
  assert.equal(b.preSaleHike.detected, false, "a normal history on another store is not flagged");
  assert.notEqual(b.verdict, "misleading");
});

test("a real price drop below the usual price is genuine", () => {
  const dated = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 1) + i * 86_400_000).toISOString().slice(0, 10),
    marketplaceId: "amazon" as const,
    price: i === 59 ? 9000 : 10000,
  }));
  const a = analyzeDiscount({ marketplaceId: "amazon", price: 9000, mrp: 12000 }, dated);
  assert.equal(a.verdict, "genuine");
  assert.equal(a.realDiscountPct, 10);
});

test("too little history is 'unverified', never a guess", () => {
  const h: PricePoint[] = [{ date: "2026-11-24", marketplaceId: "amazon", price: 100 }, { date: "2026-11-25", marketplaceId: "amazon", price: 90 }];
  assert.equal(analyzeDiscount({ marketplaceId: "amazon", price: 90, mrp: 200 }, h).verdict, "unverified");
});

test("seller trust: suspiciously cheap low-rated no-returns seller is low; retailer itself is high", async () => {
  const { detail } = await load("sony-wh-1000xm5");
  const shady = detail.offers.find((o) => o.marketplaceId === "amazon")!;
  const croma = detail.offers.find((o) => o.marketplaceId === "croma")!;
  const s = assessSeller(shady, detail.offers, detail.product.brand);
  assert.equal(s.level, "low");
  assert.ok(s.risks.some((r) => r.includes("too good to be true")));
  assert.ok(s.risks.some((r) => r.includes("No returns")));
  assert.equal(assessSeller(croma, detail.offers, detail.product.brand).level, "high");
});

test("bank card matching: plain bank matches, co-brand offers need the co-brand card", () => {
  const hdfc = { bank: "HDFC Bank", cardType: "credit" as const, description: "", discount: 1 };
  const fkAxis = { bank: "Flipkart Axis Bank", cardType: "credit" as const, description: "", discount: 1 };
  const iciciAny = { bank: "ICICI Bank", cardType: "any" as const, description: "", discount: 1 };
  assert.equal(cardMatchesOffer({ bank: "hdfc", cardType: "credit" }, hdfc), true);
  assert.equal(cardMatchesOffer({ bank: "HDFC", cardType: "debit" }, hdfc), false, "credit-only offer");
  assert.equal(cardMatchesOffer({ bank: "Axis", cardType: "credit" }, fkAxis), false);
  assert.equal(cardMatchesOffer({ bank: "Flipkart Axis Bank", cardType: "credit" }, fkAxis), true);
  assert.equal(cardMatchesOffer({ bank: "Amazon Pay ICICI", cardType: "credit" }, iciciAny), true);
  assert.equal(bestOfferForCards([hdfc, iciciAny], []), null, "no cards, no bank offer");
});

test("personalised ranking uses only the shopper's cards and caps exchange at the store maximum", async () => {
  const { detail } = await load("iphone-16-128gb");
  const trust = new Map(detail.offers.map((o) => [o, assessSeller(o, detail.offers, detail.product.brand)]));
  const { ranked } = personaliseOffers({ offers: detail.offers, sellerTrust: trust, cards: [{ bank: "SBI", cardType: "credit" }], priorities: { price: 1, delivery: 0, returns: 0, sellerTrust: 0 } });
  const rel = ranked.find((r) => r.marketplaceId === "reliance-digital")!;
  assert.equal(rel.applicableBankOffer?.bank, "SBI Card");
  assert.equal(rel.yourPrice, 72490 - 3000);
  const amazon = ranked.find((r) => r.marketplaceId === "amazon")!;
  assert.equal(amazon.applicableBankOffer, null, "HDFC offer must not apply to an SBI card");
  assert.equal(ranked[0]!.yourPrice, Math.min(...ranked.map((r) => r.yourPrice)), "price-only priorities pick the cheapest");

  const withExchange = personaliseOffers({ offers: detail.offers, sellerTrust: trust, cards: [], exchangeValue: 100000 });
  const fk = withExchange.ranked.find((r) => r.marketplaceId === "flipkart")!;
  assert.equal(fk.exchangeValueUsed, 40000, "capped at Flipkart's exchangeUpTo");
  const vs = withExchange.ranked.find((r) => r.marketplaceId === "vijay-sales")!;
  assert.equal(vs.exchangeValueUsed, 0, "store without exchange");
});

test("delivery deadline excludes slow stores and says why", async () => {
  const { detail } = await load("lg-55-4k-ur7500");
  const { ranked, excluded } = personaliseOffers({ offers: detail.offers, sellerTrust: new Map(), cards: [], maxDeliveryDays: 3 });
  assert.ok(ranked.every((r) => r.deliveryDays <= 3));
  assert.ok(excluded.some((e) => e.marketplaceId === "vijay-sales" && e.reason.includes("5 days")));
});

test("price insight verdicts", () => {
  const h = (prices: number[]): PricePoint[] =>
    prices.map((price, i) => ({ date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), marketplaceId: "amazon", price }));
  assert.equal(buildInsight(h([100, 110, 120]), 101).verdict, "great");
  assert.equal(buildInsight(h([100, 120, 130]), 110).verdict, "fair");
  assert.equal(buildInsight(h([100, 101, 102]), 130).verdict, "high");
  assert.equal(buildInsight([], 500).verdict, "fair");
});

test("sample history ends at today's price on every store", async () => {
  const { detail, history } = await load("macbook-air-m3-13-16gb");
  for (const o of detail.offers) {
    const last = history.filter((p) => p.marketplaceId === o.marketplaceId).sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    assert.equal(last.price, o.price);
    assert.equal(last.date, "2026-11-25");
  }
});

test("a product that always sells far below MRP is 'everyday_price', not called a scam", async () => {
  const { detail, history } = await load("lg-55-4k-ur7500");
  for (const o of detail.offers) {
    const a = analyzeDiscount(o, history);
    assert.ok(a.claimedDiscountPct >= 30);
    assert.ok(["everyday_price", "above_usual", "modest"].includes(a.verdict), `${o.marketplaceId}: ${a.verdict}`);
    assert.notEqual(a.verdict, "misleading");
  }
});

test("falling prices read as a genuine saving vs the usual price", async () => {
  const { detail, history } = await load("redmi-note-14-pro-256gb");
  for (const o of detail.offers) assert.equal(analyzeDiscount(o, history).verdict, "genuine");
});
