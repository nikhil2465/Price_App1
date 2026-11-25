import type { MarketplaceId, Offer, PricePoint } from '../../../shared/types.js';
import type { CatalogEntry } from '../data/catalog.js';

/**
 * A live adapter for one marketplace's official API.
 * Implementations must never throw for "not found": return null so the caller can fall back.
 * They may throw for transport/auth failures; the caller logs and falls back to sample data.
 */
export interface LiveOfferProvider {
  readonly marketplaceId: MarketplaceId;
  /** True only when every credential the adapter needs is configured. */
  readonly enabled: boolean;
  fetchOffer(product: CatalogEntry, signal: AbortSignal): Promise<Offer | null>;
}

/** Source of synthetic data used whenever a live quote is unavailable. */
export interface SampleDataSource {
  offer(product: CatalogEntry, marketplaceId: MarketplaceId, now: Date): Offer | null;
  history(product: CatalogEntry, marketplaceId: MarketplaceId, days: number, now: Date): PricePoint[];
}
