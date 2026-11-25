import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PricePoint, ProductDetail, RankedOffer } from "../domain/pricewise-types.js";
import { CategoryIdSchema, MarketplaceIdSchema } from "../data/schemas.js";
import { CatalogError, PRODUCT_ID_PATTERN, type CatalogProvider } from "../data/provider.js";
import { analyzeDiscount } from "../analysis/discount.js";
import { assessSeller, type SellerAssessment } from "../analysis/seller.js";
import { personaliseOffers } from "../analysis/personalize.js";
import { dailyBestPrices } from "../analysis/pricing.js";
import { getReturnGuidance } from "../knowledge/returns.js";
import type { Logger } from "../logger.js";

/**
 * The assistant's tools. Each tool is: a Zod schema (the single source of
 * truth, also rendered to the JSON Schema Claude sees), a short status label
 * for the UI, and an executor that only *reads* catalogue data and runs
 * deterministic analysis. No tool has side effects, so a retried or repeated
 * tool call is always safe.
 */

const ProductId = z.string().regex(PRODUCT_ID_PATTERN).describe("Product id exactly as returned by search_products or the app context.");
const Money = z.number().int().min(0).max(100_000_000);

const SearchInput = z.strictObject({
  query: z.string().trim().min(1).max(200).describe("What the shopper is looking for, e.g. 'noise cancelling headphones' or 'iPhone 16'."),
  category: CategoryIdSchema.optional(),
  brand: z.string().trim().min(1).max(60).optional(),
  min_price: Money.optional().describe("Minimum selling price in INR."),
  max_price: Money.optional().describe("Maximum selling price in INR (the shopper's budget)."),
  marketplaces: z.array(MarketplaceIdSchema).max(9).optional(),
  sort: z.enum(["relevance", "price-asc", "price-desc", "savings", "rating"]).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

const ProductInput = z.strictObject({ product_id: ProductId });

const HistoryInput = z.strictObject({
  product_id: ProductId,
  days: z.number().int().min(7).max(365).optional().describe("Look-back window, default 90."),
});

const CompareInput = z.strictObject({
  product_ids: z.array(ProductId).min(2).max(4),
});

const BestOfferInput = z.strictObject({
  product_id: ProductId,
  cards: z
    .array(z.strictObject({ bank: z.string().trim().min(2).max(60), card_type: z.enum(["credit", "debit"]) }))
    .max(6)
    .optional()
    .describe("Cards the shopper said they have. Omit if unknown: then no bank offer is applied."),
  exchange_value: Money.optional().describe("Value the shopper expects for an old device they will exchange, INR."),
  max_delivery_days: z.number().int().min(0).max(30).optional(),
  priorities: z
    .strictObject({
      price: z.number().min(0).max(1).optional(),
      delivery: z.number().min(0).max(1).optional(),
      returns: z.number().min(0).max(1).optional(),
      seller_trust: z.number().min(0).max(1).optional(),
    })
    .optional()
    .describe("Relative weights 0-1 for what matters to the shopper. Omit for balanced defaults."),
});

const StoreScopedInput = z.strictObject({
  product_id: ProductId,
  marketplace: MarketplaceIdSchema.optional().describe("Limit to one store. Omit to check every store."),
});

const ReturnInput = z.strictObject({
  marketplace: MarketplaceIdSchema,
  product_id: ProductId.optional().describe("Give it when known: the listing's actual return window is then included."),
  category: CategoryIdSchema.optional().describe("Needed when product_id is not given."),
});

const NoInput = z.strictObject({});

export interface ToolContext {
  catalog: CatalogProvider;
  logger: Logger;
}

/** Structured payload the UI can render as cards; never sent to the model. */
export interface ProductCard {
  id: string;
  title: string;
  brand: string;
  image: string;
  rating: number;
  ratingCount: number;
  bestPrice: number;
  bestMarketplaceId: string;
  storeCount: number;
  dataSource: "live" | "sample";
}

export interface ToolOutcome {
  /** JSON-serialisable result for the model. */
  result: unknown;
  isError?: boolean;
  cards?: ProductCard[];
}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  status: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
}

const defineTool = <S extends z.ZodType>(t: ToolDef<S>) => t;

// ---------- Compact projections (keep tool results small and unambiguous) ----------

function offerView(o: RankedOffer, trust?: SellerAssessment) {
  return {
    store: o.marketplaceId,
    seller: o.sellerName,
    seller_rating: o.sellerRating,
    seller_trust: trust?.level,
    in_stock: o.inStock,
    price: o.price,
    mrp: o.mrp,
    claimed_off_pct: o.discountPercent,
    delivery_fee: o.deliveryFee,
    delivery_days: o.deliveryDays,
    return_days: o.returnDays,
    best_bank_offer: o.bestBankOffer ? `${o.bestBankOffer.description} (₹${o.bestBankOffer.discount}, ${o.bestBankOffer.cardType})` : null,
    effective_price_with_best_bank_offer: o.effectivePrice,
    emi_per_month: o.emiPerMonth,
    exchange_up_to: o.exchangeUpTo,
    deal_score: o.dealScore,
    is_best_price: o.isBestPrice,
    is_best_deal: o.isBestDeal,
    url: o.url,
    last_checked_at: o.lastCheckedAt,
  };
}

/** Card for the UI, using the same "best price" definition as search: lowest in-stock effective price. */
function card(d: ProductDetail): ProductCard {
  const inStock = d.offers.filter((o) => o.inStock);
  const best = (inStock.length ? inStock : d.offers).reduce((a, b) => (b.effectivePrice < a.effectivePrice ? b : a));
  return {
    id: d.product.id,
    title: d.product.title,
    brand: d.product.brand,
    image: d.product.image,
    rating: d.product.rating,
    ratingCount: d.product.ratingCount,
    bestPrice: best.effectivePrice,
    bestMarketplaceId: best.marketplaceId,
    storeCount: inStock.length,
    dataSource: d.dataSource,
  };
}

const notFound = (id: string): ToolOutcome => ({
  result: { found: false, message: `No product with id "${id}". Use search_products to find the right id.` },
});

function trustMap(d: ProductDetail): Map<RankedOffer, SellerAssessment> {
  return new Map(d.offers.map((o) => [o, assessSeller(o, d.offers, d.product.brand)]));
}

async function detailWithHistory(ctx: ToolContext, id: string, days = 90): Promise<{ detail: ProductDetail; history: PricePoint[] } | null> {
  const [detail, history] = await Promise.all([ctx.catalog.getProduct(id), ctx.catalog.getPriceHistory(id, days)]);
  if (!detail) return null;
  return { detail, history: history ?? [] };
}

// ---------- Tools ----------

const searchProducts = defineTool({
  name: "search_products",
  status: "Searching stores",
  description:
    "Search the catalogue across all supported Indian marketplaces. Returns matching products with their best current effective price (after the best bank offer), which store has it and how many stores sell it. Use for any discovery request ('best phone under 25000', 'Sony headphones'). Set max_price to the shopper's budget (it filters on effective price).",
  schema: SearchInput,
  async run(input, ctx) {
    const res = await ctx.catalog.search({
      query: input.query,
      category: input.category,
      brand: input.brand,
      minPrice: input.min_price,
      maxPrice: input.max_price,
      marketplaces: input.marketplaces,
      sort: input.sort,
      limit: input.limit ?? 6,
    });
    return {
      result: {
        note: "Prices are effective prices: selling price + delivery fee - the best single bank offer. Call get_product_details for the plain selling price and offers.",
        total_matches: res.total,
        price_range: res.facets.priceRange,
        results: res.results.map((r) => ({
          product_id: r.product.id,
          title: r.product.title,
          brand: r.product.brand,
          category: r.product.category,
          rating: r.product.rating,
          rating_count: r.product.ratingCount,
          key_specs: r.product.specs,
          best_effective_price: r.bestPrice,
          best_store: r.bestMarketplaceId,
          highest_effective_price: r.highestPrice,
          store_count: r.storeCount,
          max_savings_vs_costliest_store: r.maxSavings,
          data_source: r.dataSource,
        })),
      },
      cards: res.results.map((r) => ({
        id: r.product.id,
        title: r.product.title,
        brand: r.product.brand,
        image: r.product.image,
        rating: r.product.rating,
        ratingCount: r.product.ratingCount,
        bestPrice: r.bestPrice,
        bestMarketplaceId: r.bestMarketplaceId,
        storeCount: r.storeCount,
        dataSource: r.dataSource,
      })),
    };
  },
});

const getProductDetails = defineTool({
  name: "get_product_details",
  status: "Comparing prices across stores",
  description:
    "Full price comparison for one product: every store's offer (price, MRP, delivery fee and days, return window, seller and seller trust level, best bank offer, effective price, EMI, exchange), the 90 day price insight, and a per-store discount check (genuine / modest / everyday_price / above_usual / misleading / unverified). Use before recommending where to buy.",
  schema: ProductInput,
  async run(input, ctx) {
    const data = await detailWithHistory(ctx, input.product_id);
    if (!data) return notFound(input.product_id);
    const { detail, history } = data;
    const trust = trustMap(detail);
    return {
      result: {
        product: {
          product_id: detail.product.id,
          title: detail.product.title,
          brand: detail.product.brand,
          category: detail.product.category,
          rating: detail.product.rating,
          rating_count: detail.product.ratingCount,
          specs: detail.product.specs,
        },
        data_source: detail.dataSource,
        offers: detail.offers.map((o) => offerView(o, trust.get(o))),
        price_insight_90d: detail.insight,
        discount_checks: detail.offers.map((o) => {
          const a = analyzeDiscount(o, history);
          return { store: o.marketplaceId, verdict: a.verdict, claimed_off_pct: a.claimedDiscountPct, real_off_vs_usual_pct: a.realDiscountPct, reasons: a.reasons };
        }),
        seller_risks: detail.offers
          .map((o) => ({ store: o.marketplaceId, risks: trust.get(o)?.risks.filter((r) => !r.startsWith("Sample data")) ?? [] }))
          .filter((r) => r.risks.length > 0),
      },
      cards: [card(detail)],
    };
  },
});

const getPriceHistory = defineTool({
  name: "get_price_history",
  status: "Checking price history",
  description:
    "Price history for a product: per-store lowest/highest/median and today's price, plus the weekly best price across stores and the trend. Use for 'should I buy now or wait', 'is this the lowest price', or 'was the price raised before the sale'.",
  schema: HistoryInput,
  async run(input, ctx) {
    const days = input.days ?? 90;
    const history = await ctx.catalog.getPriceHistory(input.product_id, days);
    if (!history) return notFound(input.product_id);
    if (history.length === 0) return { result: { product_id: input.product_id, message: "No price history recorded yet." } };
    const stores = [...new Set(history.map((p) => p.marketplaceId))];
    const perStore = stores.map((s) => {
      const pts = history.filter((p) => p.marketplaceId === s).sort((a, b) => a.date.localeCompare(b.date));
      const prices = pts.map((p) => p.price);
      const sorted = [...prices].sort((a, b) => a - b);
      return {
        store: s,
        today: pts.at(-1)?.price,
        lowest: sorted[0],
        lowest_on: pts.find((p) => p.price === sorted[0])?.date,
        highest: sorted.at(-1),
        median: sorted[Math.floor(sorted.length / 2)],
        days: pts.length,
      };
    });
    const daily = dailyBestPrices(history);
    const weekly = daily.filter((_, i) => (daily.length - 1 - i) % 7 === 0);
    const avg = (xs: { price: number }[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b.price, 0) / xs.length) : null);
    const firstMonth = avg(daily.slice(0, 30));
    const lastMonth = avg(daily.slice(-30));
    let trend: "falling" | "rising" | "flat" = "flat";
    if (firstMonth && lastMonth) {
      const change = (lastMonth - firstMonth) / firstMonth;
      trend = change <= -0.03 ? "falling" : change >= 0.03 ? "rising" : "flat";
    }
    return {
      result: {
        product_id: input.product_id,
        window_days: days,
        from: daily[0]?.date,
        to: daily.at(-1)?.date,
        per_store: perStore,
        weekly_best_price: weekly,
        trend_first_30d_avg_vs_last_30d_avg: { first: firstMonth, last: lastMonth, trend },
        note: "Prices exclude bank offers. Sale events (e.g. festive sales) can drop prices further; history cannot predict them with certainty.",
      },
    };
  },
});

const compareProducts = defineTool({
  name: "compare_products",
  status: "Comparing products",
  description:
    "Side-by-side comparison of 2 to 4 different products: key specs aligned by spec name, rating, best current price and store, 90 day price verdict. Use when the shopper is choosing between models.",
  schema: CompareInput,
  async run(input, ctx) {
    const ids = [...new Set(input.product_ids)];
    const details = await ctx.catalog.compare(ids);
    const missing = ids.filter((id) => !details.some((d) => d.product.id === id));
    const specNames = [...new Set(details.flatMap((d) => Object.keys(d.product.specs)))];
    return {
      result: {
        missing_product_ids: missing,
        products: details.map((d) => {
          const c = card(d);
          return {
            product_id: d.product.id,
            title: d.product.title,
            brand: d.product.brand,
            rating: d.product.rating,
            rating_count: d.product.ratingCount,
            best_effective_price: c.bestPrice,
            best_store: c.bestMarketplaceId,
            in_stock_store_count: c.storeCount,
            price_verdict_90d: d.insight.verdict,
            price_advice: d.insight.advice,
            data_source: d.dataSource,
          };
        }),
        specs: Object.fromEntries(specNames.map((name) => [name, Object.fromEntries(details.map((d) => [d.product.id, d.product.specs[name] ?? "not listed"]))])),
      },
      cards: details.map(card),
    };
  },
});

const findBestOffer = defineTool({
  name: "find_best_offer",
  status: "Working out your best deal",
  description:
    "Ranks a product's offers for this particular shopper: applies only the bank offers their cards qualify for, their exchange value, a delivery deadline, and their priorities (price, delivery, returns, seller trust). Returns 'your_price' (out of pocket) per store. Use whenever the shopper mentions their card, exchange, urgency, or asks 'where should I buy'.",
  schema: BestOfferInput,
  async run(input, ctx) {
    const detail = await ctx.catalog.getProduct(input.product_id);
    if (!detail) return notFound(input.product_id);
    const { ranked, excluded } = personaliseOffers({
      offers: detail.offers,
      sellerTrust: trustMap(detail),
      cards: (input.cards ?? []).map((c) => ({ bank: c.bank, cardType: c.card_type })),
      exchangeValue: input.exchange_value,
      maxDeliveryDays: input.max_delivery_days,
      priorities: input.priorities
        ? { price: input.priorities.price, delivery: input.priorities.delivery, returns: input.priorities.returns, sellerTrust: input.priorities.seller_trust }
        : undefined,
    });
    return {
      result: {
        product_id: detail.product.id,
        title: detail.product.title,
        data_source: detail.dataSource,
        cards_considered: input.cards ?? [],
        ranked_offers: ranked.map((r) => ({
          store: r.marketplaceId,
          seller: r.sellerName,
          price: r.price,
          delivery_fee: r.deliveryFee,
          your_bank_offer: r.applicableBankOffer ? `${r.applicableBankOffer.description} (₹${r.applicableBankOffer.discount})` : null,
          exchange_value_used: r.exchangeValueUsed,
          your_price: r.yourPrice,
          delivery_days: r.deliveryDays,
          return_days: r.returnDays,
          seller_trust: r.sellerTrust,
          emi_per_month: r.emiPerMonth,
          score: r.score,
          url: r.url,
          last_checked_at: r.lastCheckedAt,
        })),
        excluded,
        note: "Exchange value is the shopper's estimate capped at each store's maximum; the final exchange price is set after the device is inspected.",
      },
      cards: [card(detail)],
    };
  },
});

const checkDiscount = defineTool({
  name: "check_discount",
  status: "Checking if the discount is real",
  description:
    "Checks whether a discount is genuine: compares the claimed '% off MRP' with what the product actually sold for on that store recently, detects inflated MRPs and prices raised just before a sale. Use for 'is this a real deal', 'fake discount', 'is 70% off real'.",
  schema: StoreScopedInput,
  async run(input, ctx) {
    const data = await detailWithHistory(ctx, input.product_id);
    if (!data) return notFound(input.product_id);
    const offers = data.detail.offers.filter((o) => !input.marketplace || o.marketplaceId === input.marketplace);
    if (offers.length === 0) return { result: { found: false, message: `${input.marketplace} does not list this product.` } };
    return {
      result: {
        product_id: data.detail.product.id,
        title: data.detail.product.title,
        data_source: data.detail.dataSource,
        checks: offers.map((o) => analyzeDiscount(o, data.history)),
        method: "Real discount = saving vs the median price on the same store over the last 90 days (today excluded). Claimed discount = saving vs MRP.",
      },
    };
  },
});

const assessSellerTool = defineTool({
  name: "assess_seller",
  status: "Checking seller trust",
  description:
    "Seller trust check for a product's listings: seller rating, whether it is the retailer or brand's own store, return window, price far below other stores (counterfeit or grey-market risk), slow delivery. Use for 'is this seller genuine', 'is it safe to buy from X', or before recommending an unusually cheap offer.",
  schema: StoreScopedInput,
  async run(input, ctx) {
    const detail = await ctx.catalog.getProduct(input.product_id);
    if (!detail) return notFound(input.product_id);
    const offers = detail.offers.filter((o) => !input.marketplace || o.marketplaceId === input.marketplace);
    if (offers.length === 0) return { result: { found: false, message: `${input.marketplace} does not list this product.` } };
    return {
      result: {
        product_id: detail.product.id,
        title: detail.product.title,
        data_source: detail.dataSource,
        assessments: offers.map((o) => assessSeller(o, detail.offers, detail.product.brand)),
        method: "Heuristic risk signal from listing data only; it is not a verdict on the seller. Buyer protections: pay via the marketplace, check the invoice and warranty on delivery.",
      },
    };
  },
});

const getReturnPolicy = defineTool({
  name: "get_return_policy",
  status: "Checking return policy",
  description:
    "Return, replacement and refund guidance for a store and category: the listing's actual return window (when product_id is given), category rules (e.g. replacement-only for phones), how to start a return, and the escalation path if a return is refused. Use for any returns, refund, damaged, defective or wrong item question.",
  schema: ReturnInput,
  async run(input, ctx) {
    let category = input.category;
    let returnDays: number | null = null;
    let title: string | undefined;
    if (input.product_id) {
      const d = await ctx.catalog.getProduct(input.product_id);
      if (!d) return notFound(input.product_id);
      category = d.product.category;
      title = d.product.title;
      returnDays = d.offers.find((o) => o.marketplaceId === input.marketplace)?.returnDays ?? null;
    }
    if (!category) {
      return { isError: true, result: { error: "Give product_id or category so the right category rules can be applied." } };
    }
    return { result: { product_title: title, ...getReturnGuidance(input.marketplace, category, returnDays) } };
  },
});

const listMarketplaces = defineTool({
  name: "list_marketplaces",
  status: "Checking supported stores",
  description: "Lists the stores this app compares, their categories, and whether live prices are enabled for each. Use when asked which stores are covered or about a store that may not be supported.",
  schema: NoInput,
  async run(_input, ctx) {
    const m = await ctx.catalog.listMarketplaces();
    return { result: { marketplaces: m.map((x) => ({ id: x.id, name: x.name, categories: x.categories, live_prices: x.liveEnabled })) } };
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS: ToolDef<any>[] = [
  searchProducts,
  getProductDetails,
  findBestOffer,
  compareProducts,
  getPriceHistory,
  checkDiscount,
  assessSellerTool,
  getReturnPolicy,
  listMarketplaces,
];

const TOOL_INDEX = new Map(TOOLS.map((t) => [t.name, t]));

function toInputSchema(schema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Beta.BetaTool.InputSchema;
}

/**
 * Tool definitions sent to Claude. Built once: a stable, deterministic tool
 * list keeps the prompt cache prefix identical across requests.
 */
export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: toInputSchema(t.schema),
  eager_input_streaming: true,
}));

export function toolStatus(name: string): string {
  return TOOL_INDEX.get(name)?.status ?? "Working";
}

/**
 * Validates and runs one tool call. Never throws: every failure becomes an
 * error result the model can recover from (and explain to the shopper).
 */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const tool = TOOL_INDEX.get(name);
  if (!tool) return { isError: true, result: { error: `Unknown tool "${name}".` } };
  const parsed = (tool.schema as z.ZodType).safeParse(rawInput);
  if (!parsed.success) {
    return {
      isError: true,
      result: {
        error: "Invalid tool input.",
        issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
        received: rawInput,
      },
    };
  }
  const started = Date.now();
  try {
    const out = await tool.run(parsed.data, ctx);
    ctx.logger.debug("tool_ok", { tool: name, ms: Date.now() - started, is_error: !!out.isError });
    return out;
  } catch (err) {
    const retryable = err instanceof CatalogError ? err.retryable : false;
    ctx.logger.warn("tool_failed", { tool: name, ms: Date.now() - started, retryable, err_message: err instanceof Error ? err.message : String(err) });
    return {
      isError: true,
      result: {
        error: retryable
          ? "The price service is temporarily unavailable. Tell the shopper prices could not be fetched right now and to try again shortly; do not guess prices."
          : "Could not load this data. Do not guess; tell the shopper this information is unavailable right now.",
      },
    };
  }
}
