import type {
  DataSource,
  MarketplaceId,
  Offer,
  PricePoint,
  ProductDetail,
  ProductSummary,
} from '../../../shared/types.js';
import type { CatalogEntry } from '../data/catalog.js';
import { marketplacesForCategory } from '../data/marketplaces.js';
import { TtlCache } from '../lib/cache.js';
import { logger } from '../lib/logger.js';
import type { LiveOfferProvider, SampleDataSource } from '../providers/types.js';
import { buildInsight } from './insight.js';
import { rankOffers } from './ranking.js';

const LIVE_TIMEOUT_MS = 4_000;

export interface OfferServiceDeps {
  sample: SampleDataSource;
  live: LiveOfferProvider[];
  cacheTtlMs: number;
  now?: () => Date;
}

/**
 * Collects offers for a product from every marketplace that sells its category.
 * Each store is quoted live when an enabled adapter and a store id exist; otherwise, or on any live failure,
 * the store falls back to clearly-tagged sample data. One slow store never blocks the others.
 */
export class OfferService {
  private readonly live = new Map<MarketplaceId, LiveOfferProvider>();
  private readonly liveCache: TtlCache<Offer | null>;
  private readonly now: () => Date;

  constructor(private readonly deps: OfferServiceDeps) {
    for (const p of deps.live) if (p.enabled) this.live.set(p.marketplaceId, p);
    this.liveCache = new TtlCache<Offer | null>(deps.cacheTtlMs);
    this.now = deps.now ?? (() => new Date());
  }

  isLiveEnabled(id: MarketplaceId): boolean {
    return this.live.has(id);
  }

  private async liveOffer(provider: LiveOfferProvider, product: CatalogEntry): Promise<Offer | null> {
    const key = `${provider.marketplaceId}:${product.id}`;
    return this.liveCache.getOrLoad(key, async () => {
      const signal = AbortSignal.timeout(LIVE_TIMEOUT_MS);
      return provider.fetchOffer(product, signal);
    });
  }

  async offersFor(product: CatalogEntry, stores?: MarketplaceId[]): Promise<Offer[]> {
    const now = this.now();
    const targets = marketplacesForCategory(product.category).filter((m) => !stores || stores.includes(m));
    const results = await Promise.all(
      targets.map(async (m): Promise<Offer | null> => {
        const provider = this.live.get(m);
        if (provider && product.externalIds?.[m]) {
          try {
            const offer = await this.liveOffer(provider, product);
            if (offer) return offer;
          } catch (err) {
            logger.warn({ err: (err as Error).message, marketplace: m, productId: product.id }, 'live offer failed, using sample');
          }
        }
        return this.deps.sample.offer(product, m, now);
      }),
    );
    return results.filter((o): o is Offer => o !== null);
  }

  history(product: CatalogEntry, days: number): PricePoint[] {
    const now = this.now();
    return marketplacesForCategory(product.category).flatMap((m) => this.deps.sample.history(product, m, days, now));
  }

  async detail(product: CatalogEntry): Promise<ProductDetail> {
    const offers = rankOffers(await this.offersFor(product));
    const inStockPrices = offers.filter((o) => o.inStock).map((o) => o.price);
    const currentBest = inStockPrices.length ? Math.min(...inStockPrices) : null;
    const insight = buildInsight(this.history(product, 90), currentBest);
    return { product: toPublic(product), offers, insight, dataSource: overallSource(offers) };
  }

  async summary(product: CatalogEntry, stores?: MarketplaceId[]): Promise<ProductSummary | null> {
    const ranked = rankOffers(await this.offersFor(product, stores));
    const inStock = ranked.filter((o) => o.inStock);
    const best = inStock[0];
    if (!best) return null;
    const highest = Math.max(...inStock.map((o) => o.effectivePrice));
    return {
      product: toPublic(product),
      bestPrice: best.effectivePrice,
      bestMarketplaceId: best.marketplaceId,
      highestPrice: highest,
      storeCount: inStock.length,
      maxSavings: highest - best.effectivePrice,
      dataSource: overallSource(ranked),
    };
  }
}

function overallSource(offers: { dataSource: DataSource }[]): DataSource {
  return offers.length > 0 && offers.every((o) => o.dataSource === 'live') ? 'live' : 'sample';
}

/** Strips internal anchor fields (basePrice) before sending a product to clients. */
export function toPublic(entry: CatalogEntry) {
  const { basePrice: _b, ...rest } = entry;
  return rest;
}
