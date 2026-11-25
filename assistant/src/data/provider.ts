import type {
  CategoryId,
  Marketplace,
  MarketplaceId,
  PricePoint,
  ProductDetail,
  SearchResponse,
  SortKey,
} from "../domain/pricewise-types.js";

export interface SearchParams {
  query: string;
  category?: CategoryId;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  marketplaces?: MarketplaceId[];
  sort?: SortKey;
  limit?: number;
}

/**
 * Read-only catalogue access used by the assistant's tools. Two implementations:
 * `HttpCatalogProvider` (the PriceWise API) and `SampleCatalogProvider`
 * (bundled sample data for standalone runs and tests).
 *
 * Contract: methods resolve `null` for "not found" and throw `CatalogError`
 * for transport or upstream failures, so tools can tell the model the
 * difference between "no such product" and "the price service is down".
 */
export interface CatalogProvider {
  readonly name: string;
  search(params: SearchParams): Promise<SearchResponse>;
  getProduct(productId: string): Promise<ProductDetail | null>;
  getPriceHistory(productId: string, days: number): Promise<PricePoint[] | null>;
  compare(productIds: string[]): Promise<ProductDetail[]>;
  listMarketplaces(): Promise<Marketplace[]>;
}

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

/** Product ids are opaque slugs; this bounds them before they reach a URL or lookup. */
export const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidProductId(id: string): boolean {
  return PRODUCT_ID_PATTERN.test(id);
}
