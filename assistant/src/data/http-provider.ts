import { z } from "zod";
import type {
  Marketplace,
  PricePoint,
  ProductDetail,
  SearchResponse,
} from "../domain/pricewise-types.js";
import type { Logger } from "../logger.js";
import { CatalogError, isValidProductId, type CatalogProvider, type SearchParams } from "./provider.js";
import {
  MarketplaceSchema,
  PricePointSchema,
  ProductDetailSchema,
  SearchResponseSchema,
} from "./schemas.js";

export interface HttpCatalogOptions {
  baseUrl: string;
  timeoutMs: number;
  logger: Logger;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

const MAX_ATTEMPTS = 2;

/**
 * Reads the PriceWise API (read-only GET endpoints). Every response is schema
 * validated; transient failures (network, 5xx, 429) are retried once with a
 * short jittered backoff, since all calls are idempotent GETs.
 */
export class HttpCatalogProvider implements CatalogProvider {
  readonly name = "pricewise-api";
  private readonly base: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HttpCatalogOptions) {
    this.base = new URL(opts.baseUrl.endsWith("/") ? opts.baseUrl : `${opts.baseUrl}/`);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async search(p: SearchParams): Promise<SearchResponse> {
    const qs = new URLSearchParams({ q: p.query });
    if (p.category) qs.set("category", p.category);
    if (p.brand) qs.set("brand", p.brand);
    if (p.minPrice !== undefined) qs.set("minPrice", String(p.minPrice));
    if (p.maxPrice !== undefined) qs.set("maxPrice", String(p.maxPrice));
    if (p.marketplaces?.length) qs.set("marketplaces", p.marketplaces.join(","));
    if (p.sort) qs.set("sort", p.sort);
    const res = await this.get(`api/search?${qs}`, SearchResponseSchema);
    if (res === null) throw new CatalogError("Search endpoint returned 404", false, 404);
    const data = res as SearchResponse;
    return p.limit ? { ...data, results: data.results.slice(0, p.limit) } : data;
  }

  async getProduct(productId: string): Promise<ProductDetail | null> {
    if (!isValidProductId(productId)) return null;
    return (await this.get(`api/products/${encodeURIComponent(productId)}`, ProductDetailSchema)) as ProductDetail | null;
  }

  async getPriceHistory(productId: string, days: number): Promise<PricePoint[] | null> {
    if (!isValidProductId(productId)) return null;
    const d = Math.min(365, Math.max(7, Math.trunc(days)));
    return (await this.get(
      `api/products/${encodeURIComponent(productId)}/history?days=${d}`,
      z.array(PricePointSchema),
    )) as PricePoint[] | null;
  }

  async compare(productIds: string[]): Promise<ProductDetail[]> {
    const ids = productIds.filter(isValidProductId);
    if (ids.length === 0) return [];
    const qs = new URLSearchParams({ ids: ids.join(",") });
    const res = await this.get(`api/compare?${qs}`, z.array(ProductDetailSchema));
    return (res ?? []) as ProductDetail[];
  }

  async listMarketplaces(): Promise<Marketplace[]> {
    const res = await this.get("api/marketplaces", z.array(MarketplaceSchema));
    return (res ?? []) as Marketplace[];
  }

  /** GET + validate. Resolves null on 404. Throws CatalogError otherwise. */
  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const url = new URL(path, this.base);
    let lastErr: CatalogError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (res.status === 404) return null;
        if (!res.ok) {
          const retryable = res.status >= 500 || res.status === 429;
          throw new CatalogError(`PriceWise API ${res.status} for ${url.pathname}`, retryable, res.status);
        }
        const body: unknown = await res.json();
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          this.opts.logger.error("catalog_response_invalid", {
            path: url.pathname,
            issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
          });
          throw new CatalogError(`PriceWise API returned an unexpected payload for ${url.pathname}`, false);
        }
        return parsed.data;
      } catch (err) {
        lastErr =
          err instanceof CatalogError
            ? err
            : new CatalogError(`PriceWise API unreachable: ${err instanceof Error ? err.message : String(err)}`, true);
        if (!lastErr.retryable || attempt === MAX_ATTEMPTS) break;
        this.opts.logger.warn("catalog_retry", { path: url.pathname, attempt, reason: lastErr.message });
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
      }
    }
    throw lastErr ?? new CatalogError("PriceWise API request failed", false);
  }
}
