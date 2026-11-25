import type { BankOffer, MarketplaceId, Offer, PricePoint } from '../../../shared/types.js';
import type { CatalogEntry } from '../data/catalog.js';
import { marketplacesForCategory } from '../data/marketplaces.js';
import { createRng, hashString, retailRound } from '../lib/rng.js';
import type { SampleDataSource } from './types.js';

/** Search pages on each store. Links open a store search for the product title, never a fabricated product page. */
const SEARCH_URL: Record<MarketplaceId, (q: string, slug: string) => string> = {
  amazon: (q) => `https://www.amazon.in/s?k=${q}`,
  flipkart: (q) => `https://www.flipkart.com/search?q=${q}`,
  croma: (q) => `https://www.croma.com/searchB?q=${q}`,
  'reliance-digital': (q) => `https://www.reliancedigital.in/search?q=${q}`,
  'vijay-sales': (q) => `https://www.vijaysales.com/search-listing?q=${q}`,
  'tata-cliq': (q) => `https://www.tatacliq.com/search/?searchCategory=all&text=${q}`,
  myntra: (_q, slug) => `https://www.myntra.com/${slug}`,
  ajio: (q) => `https://www.ajio.com/search/?text=${q}`,
  nykaa: (q) => `https://www.nykaa.com/search/result/?q=${q}`,
};

const SELLERS: Record<MarketplaceId, string[]> = {
  amazon: ['Appario Retail', 'Clicktech Retail', 'Darshita Etel'],
  flipkart: ['RetailNet', 'SuperComNet', 'Truenet Commerce'],
  croma: ['Croma'],
  'reliance-digital': ['Reliance Digital'],
  'vijay-sales': ['Vijay Sales'],
  'tata-cliq': ['Tata CLiQ Retail', 'Brand Store'],
  myntra: ['Myntra Fashion', 'Brand Store'],
  ajio: ['AJIO Retail'],
  nykaa: ['Nykaa E-Retail'],
};

const BANKS: { bank: string; cardType: BankOffer['cardType']; pct: number; cap: number }[] = [
  { bank: 'HDFC Bank', cardType: 'credit', pct: 0.1, cap: 5000 },
  { bank: 'ICICI Bank', cardType: 'credit', pct: 0.075, cap: 4000 },
  { bank: 'SBI Card', cardType: 'credit', pct: 0.1, cap: 3000 },
  { bank: 'Axis Bank', cardType: 'any', pct: 0.05, cap: 2500 },
  { bank: 'Kotak Mahindra Bank', cardType: 'debit', pct: 0.05, cap: 1500 },
  { bank: 'IDFC FIRST Bank', cardType: 'credit', pct: 0.075, cap: 2000 },
];

/** Marketplaces that always stock every product in their categories in the sample set. */
const ALWAYS_LISTED: MarketplaceId[] = ['amazon', 'flipkart'];

const DAY_MS = 86_400_000;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class SampleCatalogSource implements SampleDataSource {
  offer(product: CatalogEntry, marketplaceId: MarketplaceId, now: Date): Offer | null {
    if (!marketplacesForCategory(product.category).includes(marketplaceId)) return null;
    const rng = createRng(hashString(`${product.id}|${marketplaceId}|offer`));

    if (!ALWAYS_LISTED.includes(marketplaceId) && rng() < 0.18) return null;

    const spread = 0.955 + rng() * 0.085;
    const price = Math.min(product.mrp, retailRound(product.basePrice * spread));
    const inStock = rng() > 0.08;
    const fast = marketplaceId === 'amazon' || marketplaceId === 'flipkart';
    const deliveryDays = fast ? 1 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 5);
    const deliveryFee = price >= 499 ? 0 : marketplaceId === 'flipkart' ? 40 : 49;
    const sellers = SELLERS[marketplaceId];
    const sellerName = sellers[Math.floor(rng() * sellers.length)] ?? sellers[0] ?? 'Marketplace seller';
    const sellerRating = Math.round((3.8 + rng() * 1.1) * 10) / 10;
    const isFashionOrBeauty = product.category === 'fashion' || product.category === 'beauty';
    const returnDays = isFashionOrBeauty ? (rng() < 0.5 ? 15 : 30) : rng() < 0.6 ? 7 : 10;
    const emiPerMonth = price >= 3000 ? Math.ceil(price / 12) : null;

    const bankOffers: BankOffer[] = [];
    if (price >= 1000) {
      const count = Math.floor(rng() * 3); // 0..2
      const start = Math.floor(rng() * BANKS.length);
      for (let i = 0; i < count; i++) {
        const b = BANKS[(start + i * 2) % BANKS.length];
        if (!b) continue;
        const discount = Math.min(b.cap, Math.round((price * b.pct) / 50) * 50);
        if (discount <= 0) continue;
        bankOffers.push({
          bank: b.bank,
          cardType: b.cardType,
          discount,
          description: `${Math.round(b.pct * 1000) / 10}% instant discount on ${b.bank} ${
            b.cardType === 'any' ? 'cards' : `${b.cardType} cards`
          }, up to ₹${b.cap.toLocaleString('en-IN')}`,
        });
      }
    }

    const exchangeEligible =
      (product.category === 'smartphones' || product.category === 'laptops') &&
      (marketplaceId === 'amazon' || marketplaceId === 'flipkart' || rng() < 0.3);
    const exchangeUpTo = exchangeEligible ? retailRound(price * (0.3 + rng() * 0.2)) + 1 : null;

    const minutesAgo = 5 + Math.floor(rng() * 115);
    const q = encodeURIComponent(product.title);

    return {
      productId: product.id,
      marketplaceId,
      price,
      mrp: product.mrp,
      inStock,
      deliveryDays,
      deliveryFee,
      sellerName,
      sellerRating,
      returnDays,
      emiPerMonth,
      bankOffers,
      exchangeUpTo,
      url: SEARCH_URL[marketplaceId](q, slugify(`${product.brand} ${product.category}`)),
      lastCheckedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
      dataSource: 'sample',
    };
  }

  /**
   * Synthetic daily price series that ends at today's sample price.
   * Includes two sale windows so the chart and "buy or wait" advice have something meaningful to show.
   */
  history(product: CatalogEntry, marketplaceId: MarketplaceId, days: number, now: Date): PricePoint[] {
    const current = this.offer(product, marketplaceId, now);
    if (!current) return [];
    const rng = createRng(hashString(`${product.id}|${marketplaceId}|history`));
    const regular = Math.min(product.mrp, current.price * (1.02 + rng() * 0.06));
    const saleA = 15 + Math.floor(rng() * 20); // days ago
    const saleB = 50 + Math.floor(rng() * 30);
    const saleDepthA = 0.06 + rng() * 0.08;
    const saleDepthB = 0.04 + rng() * 0.08;

    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const points: PricePoint[] = [];
    let level = regular;
    for (let ago = days - 1; ago >= 0; ago--) {
      // occasional small list-price changes
      if (rng() < 0.06) level = Math.min(product.mrp, level * (0.98 + rng() * 0.04));
      let p = level;
      if (Math.abs(ago - saleA) <= 3) p = level * (1 - saleDepthA);
      if (Math.abs(ago - saleB) <= 4) p = level * (1 - saleDepthB);
      if (ago === 0) p = current.price;
      points.push({
        date: isoDate(new Date(today - ago * DAY_MS)),
        marketplaceId,
        price: ago === 0 ? current.price : Math.min(product.mrp, retailRound(p)),
      });
    }
    return points;
  }
}
