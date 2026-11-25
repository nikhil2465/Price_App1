import { z } from 'zod';
import type { Offer } from '../../../shared/types.js';
import type { CatalogEntry } from '../data/catalog.js';
import type { LiveOfferProvider } from './types.js';

export interface FlipkartAffiliateConfig {
  affiliateId?: string;
  token?: string;
}

const Amount = z.object({ amount: z.number() });
const ProductResponse = z.object({
  productBaseInfoV1: z.object({
    productId: z.string(),
    title: z.string().optional(),
    maximumRetailPrice: Amount.optional(),
    flipkartSellingPrice: Amount.optional(),
    flipkartSpecialPrice: Amount.optional(),
    productUrl: z.string().url().optional(),
    inStock: z.boolean().optional(),
  }),
  productShippingInfoV1: z.object({ shippingCharges: Amount.optional(), sellerName: z.string().optional() }).partial().optional(),
});

/**
 * Flipkart Affiliate API adapter (product lookup by FSN/product id).
 * Requires approval in the Flipkart Affiliate programme. Credentials are sent as headers, never in URLs.
 */
export class FlipkartAffiliateProvider implements LiveOfferProvider {
  readonly marketplaceId = 'flipkart' as const;
  readonly enabled: boolean;

  constructor(
    private readonly cfg: FlipkartAffiliateConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.enabled = Boolean(cfg.affiliateId && cfg.token);
  }

  async fetchOffer(product: CatalogEntry, signal: AbortSignal): Promise<Offer | null> {
    const fsn = product.externalIds?.flipkart;
    if (!this.enabled || !fsn) return null;
    if (!/^[A-Z0-9]{8,20}$/.test(fsn)) throw new Error(`Invalid Flipkart product id configured for ${product.id}`);

    const url = `https://affiliate-api.flipkart.net/affiliate/1.0/product.json?id=${encodeURIComponent(fsn)}`;
    const res = await this.fetchImpl(url, {
      headers: { 'Fk-Affiliate-Id': this.cfg.affiliateId!, 'Fk-Affiliate-Token': this.cfg.token!, Accept: 'application/json' },
      signal,
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`Flipkart Affiliate API responded ${res.status}`);
    const parsed = ProductResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error('Flipkart Affiliate API returned an unexpected payload');

    const info = parsed.data.productBaseInfoV1;
    const price = info.flipkartSpecialPrice?.amount ?? info.flipkartSellingPrice?.amount;
    if (price === undefined) return null;
    const shipping = parsed.data.productShippingInfoV1;

    return {
      productId: product.id,
      marketplaceId: 'flipkart',
      price: Math.round(price),
      mrp: Math.round(info.maximumRetailPrice?.amount ?? product.mrp),
      inStock: info.inStock ?? true,
      deliveryDays: 3,
      deliveryFee: Math.round(shipping?.shippingCharges?.amount ?? 0),
      sellerName: shipping?.sellerName ?? 'Flipkart seller',
      sellerRating: 4.3,
      returnDays: 7,
      emiPerMonth: price >= 3000 ? Math.ceil(price / 12) : null,
      bankOffers: [],
      exchangeUpTo: null,
      url: info.productUrl ?? `https://www.flipkart.com/search?q=${encodeURIComponent(product.title)}`,
      lastCheckedAt: new Date().toISOString(),
      dataSource: 'live',
    };
  }
}
