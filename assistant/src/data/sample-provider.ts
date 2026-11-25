import type {
  Marketplace,
  MarketplaceId,
  Offer,
  PricePoint,
  ProductDetail,
  ProductSummary,
  SearchResponse,
} from "../domain/pricewise-types.js";
import { buildInsight, rankOffers } from "../analysis/pricing.js";
import { isValidProductId, type CatalogProvider, type SearchParams } from "./provider.js";
import { SAMPLE_PRODUCTS, type SampleOfferSpec, type SampleProductSpec } from "./sample-data.js";

const MARKETPLACES: Marketplace[] = [
  { id: "amazon", name: "Amazon", color: "#FF9900", integration: "Amazon Product Advertising API 5.0", liveEnabled: false, categories: ["smartphones", "laptops", "headphones", "televisions", "smartwatches", "appliances", "fashion", "beauty"] },
  { id: "flipkart", name: "Flipkart", color: "#2874F0", integration: "Flipkart Affiliate API", liveEnabled: false, categories: ["smartphones", "laptops", "headphones", "televisions", "smartwatches", "appliances", "fashion", "beauty"] },
  { id: "croma", name: "Croma", color: "#00A99D", integration: "Partner feed", liveEnabled: false, categories: ["smartphones", "laptops", "headphones", "televisions", "smartwatches", "appliances"] },
  { id: "reliance-digital", name: "Reliance Digital", color: "#E42529", integration: "Partner feed", liveEnabled: false, categories: ["smartphones", "laptops", "headphones", "televisions", "smartwatches", "appliances"] },
  { id: "vijay-sales", name: "Vijay Sales", color: "#D7182A", integration: "Partner feed", liveEnabled: false, categories: ["smartphones", "laptops", "televisions", "appliances"] },
  { id: "tata-cliq", name: "Tata CLiQ", color: "#9B1B5A", integration: "Affiliate network", liveEnabled: false, categories: ["smartwatches", "fashion", "appliances"] },
  { id: "myntra", name: "Myntra", color: "#FF3F6C", integration: "Affiliate network", liveEnabled: false, categories: ["fashion", "beauty"] },
  { id: "ajio", name: "AJIO", color: "#2C4152", integration: "Affiliate network", liveEnabled: false, categories: ["fashion"] },
  { id: "nykaa", name: "Nykaa", color: "#FC2779", integration: "Affiliate network", liveEnabled: false, categories: ["beauty"] },
];

/** Small deterministic PRNG (mulberry32) so sample histories are stable across runs and tests. */
function prng(seedText: string): () => number {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (Math.imul(31, seed) + seedText.charCodeAt(i)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundPrice = (n: number) => (n >= 1000 ? Math.round(n / 10) * 10 - 1 : Math.round(n));

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds a 90-day history for one offer. Day 0 (today) always equals the
 * current price so history and offers never disagree.
 */
function buildOfferHistory(productId: string, spec: SampleOfferSpec, today: Date, days: number): PricePoint[] {
  const rand = prng(`${productId}:${spec.marketplaceId}`);
  const points: PricePoint[] = [];
  for (let ago = days - 1; ago >= 0; ago--) {
    const date = new Date(today.getTime() - ago * 86_400_000);
    let price: number;
    if (ago === 0) {
      price = spec.price;
    } else {
      const noise = (rand() - 0.5) * 0.04; // +-2%
      let base = spec.typical;
      if (spec.scenario === "pre-sale-hike" && ago >= 3 && ago <= 16) base = spec.typical * 1.14;
      if (spec.scenario === "steady-decline") base = spec.price + (spec.typical * 1.12 - spec.price) * (ago / days);
      price = roundPrice(base * (1 + noise));
      // Occasional short dip (flash sale) on normal histories.
      if (spec.scenario !== "pre-sale-hike" && ago % 37 === 11) price = roundPrice(spec.typical * 0.95);
    }
    points.push({ date: isoDate(date), marketplaceId: spec.marketplaceId, price: Math.min(price, spec.mrp) });
  }
  return points;
}

export interface SampleCatalogOptions {
  /** Injected clock for deterministic tests. */
  now?: () => Date;
  products?: SampleProductSpec[];
}

/** In-memory catalogue over SAMPLE_PRODUCTS. Every result is tagged dataSource "sample". */
export class SampleCatalogProvider implements CatalogProvider {
  readonly name = "sample-catalogue";
  private readonly now: () => Date;
  private readonly specs: Map<string, SampleProductSpec>;

  constructor(opts: SampleCatalogOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.specs = new Map((opts.products ?? SAMPLE_PRODUCTS).map((s) => [s.product.id, s]));
  }

  private offersFor(spec: SampleProductSpec): Offer[] {
    const checked = new Date(this.now().getTime() - 25 * 60_000).toISOString();
    return spec.offers.map((o) => ({
      productId: spec.product.id,
      marketplaceId: o.marketplaceId,
      price: o.price,
      mrp: o.mrp,
      inStock: o.inStock ?? true,
      deliveryDays: o.deliveryDays,
      deliveryFee: o.deliveryFee ?? 0,
      sellerName: o.sellerName,
      sellerRating: o.sellerRating,
      returnDays: o.returnDays,
      emiPerMonth: o.emiPerMonth ?? null,
      bankOffers: o.bankOffers ?? [],
      exchangeUpTo: o.exchangeUpTo ?? null,
      url: `https://example.invalid/sample/${o.marketplaceId}/${spec.product.id}`,
      lastCheckedAt: checked,
      dataSource: "sample",
    }));
  }

  private history(spec: SampleProductSpec, days: number): PricePoint[] {
    const today = this.now();
    return spec.offers.flatMap((o) => buildOfferHistory(spec.product.id, o, today, days));
  }

  private detail(spec: SampleProductSpec): ProductDetail {
    const offers = rankOffers(this.offersFor(spec));
    const inStock = offers.filter((o) => o.inStock);
    const bestPrice = inStock.length ? Math.min(...inStock.map((o) => o.price)) : Math.min(...offers.map((o) => o.price));
    return {
      product: { ...spec.product, image: spec.product.image ?? "" },
      offers,
      insight: buildInsight(this.history(spec, 90), bestPrice),
      dataSource: "sample",
    };
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    const terms = params.query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const scored: { summary: ProductSummary; score: number }[] = [];
    for (const spec of this.specs.values()) {
      const pr = spec.product;
      if (params.category && pr.category !== params.category) continue;
      if (params.brand && pr.brand.toLowerCase() !== params.brand.toLowerCase()) continue;
      const haystack = [pr.title, pr.brand, pr.category, ...pr.keywords, ...Object.values(pr.specs)].join(" ").toLowerCase();
      const score = terms.length === 0 ? 1 : terms.filter((t) => haystack.includes(t)).length / terms.length;
      if (score < 0.5) continue;

      // Same definition as the PriceWise API: bestPrice is the lowest in-stock
      // effective price (price + delivery - best bank offer).
      let offers = rankOffers(this.offersFor(spec)).filter((o) => o.inStock);
      if (params.marketplaces?.length) offers = offers.filter((o) => params.marketplaces!.includes(o.marketplaceId));
      if (offers.length === 0) continue;
      const best = offers.reduce((a, b) => (b.effectivePrice < a.effectivePrice ? b : a));
      const highest = Math.max(...offers.map((o) => o.effectivePrice));
      if (params.minPrice !== undefined && best.effectivePrice < params.minPrice) continue;
      if (params.maxPrice !== undefined && best.effectivePrice > params.maxPrice) continue;
      scored.push({
        score,
        summary: {
          product: { ...pr, image: pr.image ?? "" },
          bestPrice: best.effectivePrice,
          bestMarketplaceId: best.marketplaceId as MarketplaceId,
          highestPrice: highest,
          storeCount: offers.length,
          maxSavings: highest - best.effectivePrice,
          dataSource: "sample",
        },
      });
    }
    const sort = params.sort ?? "relevance";
    scored.sort((a, b) => {
      switch (sort) {
        case "price-asc": return a.summary.bestPrice - b.summary.bestPrice;
        case "price-desc": return b.summary.bestPrice - a.summary.bestPrice;
        case "savings": return b.summary.maxSavings - a.summary.maxSavings;
        case "rating": return b.summary.product.rating - a.summary.product.rating;
        default: return b.score - a.score || b.summary.product.ratingCount - a.summary.product.ratingCount;
      }
    });
    const results = scored.map((s) => s.summary);
    const brandCounts = new Map<string, number>();
    const catCounts = new Map<ProductSummary["product"]["category"], number>();
    for (const r of results) {
      brandCounts.set(r.product.brand, (brandCounts.get(r.product.brand) ?? 0) + 1);
      catCounts.set(r.product.category, (catCounts.get(r.product.category) ?? 0) + 1);
    }
    const prices = results.map((r) => r.bestPrice);
    return {
      query: params.query,
      total: results.length,
      results: results.slice(0, params.limit ?? 10),
      facets: {
        brands: [...brandCounts].map(([value, count]) => ({ value, count })),
        categories: [...catCounts].map(([value, count]) => ({ value, count })),
        priceRange: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
      },
    };
  }

  async getProduct(productId: string): Promise<ProductDetail | null> {
    if (!isValidProductId(productId)) return null;
    const spec = this.specs.get(productId);
    return spec ? this.detail(spec) : null;
  }

  async getPriceHistory(productId: string, days: number): Promise<PricePoint[] | null> {
    if (!isValidProductId(productId)) return null;
    const spec = this.specs.get(productId);
    return spec ? this.history(spec, Math.min(365, Math.max(7, Math.trunc(days)))) : null;
  }

  async compare(productIds: string[]): Promise<ProductDetail[]> {
    const out: ProductDetail[] = [];
    for (const id of productIds) {
      const d = await this.getProduct(id);
      if (d) out.push(d);
    }
    return out;
  }

  async listMarketplaces(): Promise<Marketplace[]> {
    return MARKETPLACES;
  }
}
