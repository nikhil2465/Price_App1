import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import type { Offer } from '../../../shared/types.js';
import type { CatalogEntry } from '../data/catalog.js';
import type { LiveOfferProvider } from './types.js';

export interface AmazonPaapiConfig {
  accessKey?: string;
  secretKey?: string;
  partnerTag?: string;
  host: string;
  region: string;
}

const SERVICE = 'ProductAdvertisingAPI';
const TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
const PATH = '/paapi5/getitems';

const Money = z.object({ Amount: z.number() }).partial();
const GetItemsResponse = z.object({
  ItemsResult: z
    .object({
      Items: z
        .array(
          z.object({
            ASIN: z.string(),
            DetailPageURL: z.string().url().optional(),
            Offers: z
              .object({
                Listings: z
                  .array(
                    z.object({
                      Price: Money.optional(),
                      SavingBasis: Money.optional(),
                      Availability: z.object({ Type: z.string().optional() }).optional(),
                      MerchantInfo: z.object({ Name: z.string().optional() }).optional(),
                      DeliveryInfo: z
                        .object({ IsPrimeEligible: z.boolean().optional(), IsFreeShippingEligible: z.boolean().optional() })
                        .optional(),
                    }),
                  )
                  .optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  Errors: z.array(z.object({ Code: z.string(), Message: z.string() })).optional(),
});

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** SigV4 signing key derivation (exported so it can be checked against AWS's published test vector). */
export function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** AWS Signature Version 4 headers for a PA-API 5.0 POST request. Exported for unit testing. */
export function signPaapiRequest(params: {
  accessKey: string;
  secretKey: string;
  host: string;
  region: string;
  body: string;
  now: Date;
}): Record<string, string> {
  const amzDate = params.now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: params.host,
    'x-amz-date': amzDate,
    'x-amz-target': TARGET,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = ['POST', PATH, '', canonicalHeaders, signedHeaders, sha256Hex(params.body)].join('\n');
  const scope = `${dateStamp}/${params.region}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kSigning = deriveSigningKey(params.secretKey, dateStamp, params.region, SERVICE);
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * Amazon Product Advertising API 5.0 adapter (GetItems by ASIN).
 * Requires an approved Amazon Associates India account. Note: PA-API limits new accounts to about 1 request per second
 * and requires qualifying sales to keep access, so responses are cached by the OfferService.
 */
export class AmazonPaapiProvider implements LiveOfferProvider {
  readonly marketplaceId = 'amazon' as const;
  readonly enabled: boolean;

  constructor(
    private readonly cfg: AmazonPaapiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.enabled = Boolean(cfg.accessKey && cfg.secretKey && cfg.partnerTag);
  }

  async fetchOffer(product: CatalogEntry, signal: AbortSignal): Promise<Offer | null> {
    const asin = product.externalIds?.amazon;
    if (!this.enabled || !asin) return null;
    if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`Invalid ASIN configured for ${product.id}`);

    const body = JSON.stringify({
      ItemIds: [asin],
      ItemIdType: 'ASIN',
      PartnerTag: this.cfg.partnerTag,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.in',
      Resources: [
        'Offers.Listings.Price',
        'Offers.Listings.SavingBasis',
        'Offers.Listings.Availability.Type',
        'Offers.Listings.MerchantInfo',
        'Offers.Listings.DeliveryInfo.IsFreeShippingEligible',
      ],
    });
    const headers = signPaapiRequest({
      accessKey: this.cfg.accessKey!,
      secretKey: this.cfg.secretKey!,
      host: this.cfg.host,
      region: this.cfg.region,
      body,
      now: new Date(),
    });
    const res = await this.fetchImpl(`https://${this.cfg.host}${PATH}`, { method: 'POST', headers, body, signal });
    if (!res.ok) throw new Error(`Amazon PA-API responded ${res.status}`);
    const parsed = GetItemsResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error('Amazon PA-API returned an unexpected payload');
    if (parsed.data.Errors?.length) {
      const first = parsed.data.Errors[0]!;
      if (first.Code === 'ItemNotAccessible' || first.Code === 'InvalidParameterValue') return null;
      throw new Error(`Amazon PA-API error ${first.Code}`);
    }
    const item = parsed.data.ItemsResult?.Items?.[0];
    const listing = item?.Offers?.Listings?.[0];
    const price = listing?.Price?.Amount;
    if (!item || !listing || price === undefined) return null;

    return {
      productId: product.id,
      marketplaceId: 'amazon',
      price: Math.round(price),
      mrp: Math.round(listing.SavingBasis?.Amount ?? product.mrp),
      inStock: (listing.Availability?.Type ?? 'Now') === 'Now',
      deliveryDays: 2,
      deliveryFee: listing.DeliveryInfo?.IsFreeShippingEligible === false ? 40 : 0,
      sellerName: listing.MerchantInfo?.Name ?? 'Amazon seller',
      sellerRating: 4.3,
      returnDays: 7,
      emiPerMonth: price >= 3000 ? Math.ceil(price / 12) : null,
      bankOffers: [], // PA-API does not expose bank offers
      exchangeUpTo: null,
      url: item.DetailPageURL ?? `https://www.amazon.in/dp/${asin}?tag=${encodeURIComponent(this.cfg.partnerTag!)}`,
      lastCheckedAt: new Date().toISOString(),
      dataSource: 'live',
    };
  }
}
